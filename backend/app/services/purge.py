import asyncio
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import SessionLocal
from app.models.models import Sala

def purge_expired_temporary_rooms(db: Session) -> int:
    """
    Executa a exclusão definitiva em cascata de salas temporárias cujo TTL expirou.
    Retorna o número de salas excluídas.
    """
    now = datetime.now(timezone.utc)
    expired_rooms = db.query(Sala).filter(
        Sala.tipo_sala == "temporaria",
        Sala.expires_at.isnot(None),
        Sala.expires_at <= now
    ).all()

    count = len(expired_rooms)
    if count > 0:
        for room in expired_rooms:
            # Em cascata, o SQLAlchemy/Postgres exclui mensagens, membros e denúncias vinculadas
            db.delete(room)
        db.commit()
    return count

async def run_purge_worker(interval_seconds: int = 60):
    """
    Worker assíncrono em segundo plano para limpeza de salas temporárias expiradas.
    """
    while True:
        try:
            db = SessionLocal()
            try:
                purged = purge_expired_temporary_rooms(db)
                if purged > 0:
                    print(f"[PURGE WORKER] {purged} salas temporárias expiradas foram expurgadas com sucesso.")
            finally:
                db.close()
        except Exception as e:
            print(f"[PURGE WORKER ERROR] Falha ao executar expurgo: {e}")
        
        await asyncio.sleep(interval_seconds)
