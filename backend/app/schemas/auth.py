from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from uuid import UUID

# Registro de Usuário
class UserRegisterRequest(BaseModel):
    nickname: str
    email: str
    senha: str
    is_site_admin: Optional[bool] = False

# Login de Usuário
class UserLoginRequest(BaseModel):
    login: str  # email ou nickname
    senha: str

# Dados públicos do Usuário
class UserOut(BaseModel):
    id: UUID
    nickname: str
    email: str
    is_site_admin: bool
    is_muted_global: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Resposta de Token para Usuário Global
class UserTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# Compatibilidade com salas anônimas/efêmeras legadas
class RoomEnterRequest(BaseModel):
    nome_url: str
    senha: Optional[str] = None
    nickname: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    sala_id: str
    nickname: str
    nome_url: str
