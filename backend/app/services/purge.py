import asyncio
import re
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import SessionLocal
from app.models.models import Sala, Mensagem
from app.services.storage import delete_file_from_r2
from app.services.sse import manager


def cleanup_message_media(conteudo: str):
    """Identifica URLs de mídia e aciona a deleção física no Cloudflare R2 (RN03)."""
    if not conteudo:
        return
    urls = re.findall(r'https?://[^\s)"]+', conteudo)
    for url in urls:
        # Se for imagem ou mídia hospedada
        if any(url.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]) or "r2.dev" in url or "cloudflarestorage" in url:
            delete_file_from_r2(url)


def purge_expired_temporary_rooms(db: Session) -> int:
    """
    Executa a exclusão definitiva em cascata de salas temporárias cujo TTL expirou.
    Executa Hard Wipe nas mídias R2 e registros no DB (RN03).
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
            # Exclui mídias das mensagens da sala no R2
            mensagens = db.query(Mensagem).filter(Mensagem.sala_id == room.id).all()
            for msg in mensagens:
                cleanup_message_media(msg.conteudo)

            # Em cascata, o SQLAlchemy/Postgres exclui mensagens, membros e denúncias vinculadas
            db.delete(room)
        db.commit()
    return count


def purge_expired_messages(db: Session) -> int:
    """
    Executa a exclusão de mensagens individuais cujo TTL expirou pós-leitura (RF04, RN03).
    Remove mídias do R2 e remove linha do banco de dados com hard wipe.
    """
    now = datetime.now(timezone.utc)
    expired_msgs = db.query(Mensagem).filter(
        Mensagem.expires_at.isnot(None),
        Mensagem.expires_at <= now
    ).all()

    count = len(expired_msgs)
    if count > 0:
        for msg in expired_msgs:
            cleanup_message_media(msg.conteudo)
            sala_id = str(msg.sala_id)
            msg_id = str(msg.id)
            db.delete(msg)
            
            # Notifica clientes conectados para expurgo da memória (RN03)
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(manager.broadcast(sala_id, {
                        "type": "message_destroyed",
                        "message_id": msg_id,
                        "sala_id": sala_id
                    }))
            except Exception:
                pass

        db.commit()
    return count


async def run_purge_worker(interval_seconds: int = 15):
    """
    Worker assíncrono em segundo plano para limpeza de salas e mensagens expiradas.
    """
    while True:
        try:
            db = SessionLocal()
            try:
                purged_rooms = purge_expired_temporary_rooms(db)
                purged_msgs = purge_expired_messages(db)
                if purged_rooms > 0 or purged_msgs > 0:
                    print(f"[PURGE WORKER] {purged_rooms} salas e {purged_msgs} mensagens expiradas foram expurgadas (Hard Wipe).")
            finally:
                db.close()
        except Exception as e:
            print(f"[PURGE WORKER ERROR] Falha ao executar expurgo: {e}")
        
        await asyncio.sleep(interval_seconds)
