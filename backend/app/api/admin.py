from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel

from app.core.database import get_db
from app.core.rbac import require_site_admin
from app.models.models import Usuario, Sala, Denuncia, MembroSala
from app.schemas.auth import UserOut
from app.schemas.rooms import RoomCreate, RoomOut
from app.services.auth import get_password_hash

router = APIRouter(prefix="/admin", tags=["admin"])

class GlobalMuteRequest(BaseModel):
    is_muted_global: bool

class ReportOut(BaseModel):
    id: UUID
    denunciante_id: UUID
    mensagem_id: UUID
    sala_id: UUID
    motivo: str
    status: str
    created_at: str

@router.get("/users", response_model=List[UserOut])
def list_users(
    search: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_site_admin)
):
    query = db.query(Usuario)
    if search:
        pattern = f"%{search}%"
        query = query.filter((Usuario.nickname.ilike(pattern)) | (Usuario.email.ilike(pattern)))
    return query.limit(limit).all()


@router.patch("/users/{user_id}/mute", response_model=UserOut)
def toggle_global_mute(
    user_id: UUID,
    req: GlobalMuteRequest,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_site_admin)
):
    target_user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    
    target_user.is_muted_global = req.is_muted_global
    db.commit()
    db.refresh(target_user)
    return target_user


@router.get("/rooms", response_model=List[RoomOut])
def list_all_rooms(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_site_admin)
):
    return db.query(Sala).order_by(Sala.created_at.desc()).all()


@router.post("/rooms", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_permanent_room(
    req: RoomCreate,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_site_admin)
):
    # Verifica unicidade do nome_url
    existing = db.query(Sala).filter(Sala.nome_url == req.nome_url.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome de URL já em uso.")

    hashed_senha = get_password_hash(req.senha) if req.senha else None

    # Salas criadas pelo admin são permanentes
    room = Sala(
        nome_url=req.nome_url.strip().lower(),
        titulo=req.titulo.strip(),
        hash_senha=hashed_senha,
        parent_id=req.parent_id,
        tipo_sala="permanente",
        is_permanente=True,
        expires_at=None,
        max_membros=req.max_membros or 50,
        created_by=admin.id
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    # Admin criador se torna automaticamente membro 'admin' da sala
    membro = MembroSala(
        sala_id=room.id,
        usuario_id=admin.id,
        role="admin",
        is_muted=False
    )
    db.add(membro)
    db.commit()

    return room


@router.get("/reports")
def list_reports(
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_site_admin)
):
    reports = db.query(Denuncia).order_by(Denuncia.created_at.desc()).all()
    return [
        {
            "id": str(r.id),
            "denunciante_id": str(r.denunciante_id),
            "mensagem_id": str(r.mensagem_id),
            "sala_id": str(r.sala_id),
            "motivo": r.motivo,
            "status": r.status,
            "created_at": r.created_at.isoformat()
        }
        for r in reports
    ]
