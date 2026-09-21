from pydantic import BaseModel, field_serializer
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime, timezone

def to_utc_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    iso = dt.isoformat()
    if iso.endswith("+00:00"):
        return iso[:-6] + "Z"
    if not iso.endswith("Z") and "+" not in iso:
        return iso + "Z"
    return iso

class MessageCreate(BaseModel):
    conteudo: str
    reply_to_id: Optional[UUID] = None
    is_secret_mode: Optional[bool] = False
    ttl_seconds: Optional[int] = None
    is_view_once: Optional[bool] = False
    is_e2ee: Optional[bool] = False
    e2ee_envelope: Optional[Dict[str, Any]] = None

class MessageOut(BaseModel):
    id: UUID
    sala_id: UUID
    autor_id: Optional[UUID] = None
    autor_nickname: str
    conteudo: str
    created_at: datetime
    
    reply_to_id: Optional[UUID] = None
    reacoes: Dict[str, Any] = {}
    
    # PRD Campos
    is_secret_mode: bool = False
    ttl_seconds: Optional[int] = None
    expires_at: Optional[datetime] = None
    is_view_once: bool = False
    view_opened_at: Optional[datetime] = None
    is_e2ee: bool = False
    e2ee_envelope: Optional[Dict[str, Any]] = None
    status_recibo: Optional[str] = "sent" # 'sent', 'delivered', 'read'

    @field_serializer("created_at")
    def serialize_created_at(self, dt: datetime, _info) -> str:
        return to_utc_iso(dt)

    @field_serializer("expires_at", "view_opened_at", check_fields=False)
    def serialize_optional_datetimes(self, dt: Optional[datetime], _info) -> Optional[str]:
        return to_utc_iso(dt)

    class Config:
        from_attributes = True

class ReactionCreate(BaseModel):
    emoji: str

class ReportCreate(BaseModel):
    mensagem_id: UUID
    sala_id: UUID
    motivo: str

class BlockedUserOut(BaseModel):
    id: UUID
    bloqueado_id: UUID
    nickname: str
    created_at: datetime

    @field_serializer("created_at")
    def serialize_created_at(self, dt: datetime, _info) -> str:
        return to_utc_iso(dt)

    class Config:
        from_attributes = True