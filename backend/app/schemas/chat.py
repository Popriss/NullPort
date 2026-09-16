from pydantic import BaseModel
from typing import Optional, Dict, Any
from uuid import UUID
from datetime import datetime

class MessageCreate(BaseModel):
    conteudo: str
    reply_to_id: Optional[UUID] = None 

class MessageOut(BaseModel):
    id: UUID
    sala_id: UUID
    autor_nickname: str
    conteudo: str
    created_at: datetime
    
    reply_to_id: Optional[UUID] = None
    reacoes: Dict[str, Any] = {}

    class Config:
        from_attributes = True