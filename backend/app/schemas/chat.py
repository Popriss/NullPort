from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from uuid import UUID
from datetime import datetime

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

    class Config:
        from_attributes = True