from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class RoomCreate(BaseModel):
    nome_url: str
    titulo: str
    senha: Optional[str] = None
    parent_id: Optional[UUID] = None
    tipo_sala: Optional[str] = "temporaria"  # 'permanente' ou 'temporaria'
    ttl_minutes: Optional[int] = 1440         # Tempo de vida para salas temporárias
    max_membros: Optional[int] = 50

class RoomJoinRequest(BaseModel):
    senha: Optional[str] = None

class RoomJoinByUrlRequest(BaseModel):
    nome_url: str
    senha: Optional[str] = None

class RoomOut(BaseModel):
    id: UUID
    nome_url: str
    titulo: str
    parent_id: Optional[UUID] = None
    tipo_sala: str
    is_permanente: bool
    expires_at: Optional[datetime] = None
    max_membros: int
    created_by: Optional[UUID] = None
    created_at: datetime
    tem_senha: bool = False
    is_membro: bool = False
    sub_rooms: Optional[List["RoomOut"]] = []

    class Config:
        from_attributes = True

class MemberOut(BaseModel):
    id: UUID
    sala_id: UUID
    usuario_id: UUID
    role: str
    is_muted: bool
    nickname: Optional[str] = None
    is_online: Optional[bool] = False
    created_at: datetime

    class Config:
        from_attributes = True

class MemberRoleUpdate(BaseModel):
    role: str  # 'admin', 'mod', 'padrao', 'view'

class MemberMuteUpdate(BaseModel):
    is_muted: bool
