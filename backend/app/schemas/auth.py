from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from uuid import UUID

# Registro de Usuário
class UserRegisterRequest(BaseModel):
    nickname: str
    email: str
    senha: str
    telefone: Optional[str] = None
    is_site_admin: Optional[bool] = False

# Login de Usuário
class UserLoginRequest(BaseModel):
    login: str  # email, nickname ou telefone
    senha: str

# Exclusão de Conta (RN06 - Direito ao Esquecimento / LGPD)
class UserDeleteRequest(BaseModel):
    senha: str

# Envio e Verificação de SMS OTP (RF01)
class OTPSendRequest(BaseModel):
    telefone: str

class OTPVerifyRequest(BaseModel):
    telefone: str
    codigo: str
    nickname: Optional[str] = None

# Gestão de Sessões Ativas (RF01)
class SessionOut(BaseModel):
    id: UUID
    device_name: str
    ip_address: Optional[str] = None
    last_active_at: datetime
    created_at: datetime
    is_current: bool = False

    class Config:
        from_attributes = True

# Atualização de Chave Pública E2EE (RN01)
class PublicKeyUpdateRequest(BaseModel):
    public_key_e2ee: str

# Dados públicos do Usuário
class UserOut(BaseModel):
    id: UUID
    nickname: str
    email: str
    telefone: Optional[str] = None
    public_key_e2ee: Optional[str] = None
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
