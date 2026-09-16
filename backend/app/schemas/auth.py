from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID

class RoomEnterRequest(BaseModel):
    nome_url: str
    senha: str
    nickname: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    sala_id: str
    nickname: str
    nome_url: str
