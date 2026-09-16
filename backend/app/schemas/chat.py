from pydantic import BaseModel
from datetime import datetime
from uuid import UUID

class MessageCreate(BaseModel):
    conteudo: str

class MessageOut(BaseModel):
    id: UUID
    sala_id: UUID
    autor_nickname: str
    conteudo: str
    created_at: datetime

    class Config:
        from_attributes = True
