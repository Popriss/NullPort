from fastapi import Depends, HTTPException, status, Header, Request
from sqlalchemy.orm import Session
from typing import Optional, Tuple
from uuid import UUID

from app.core.database import get_db
from app.models.models import Usuario, MembroSala, Sala, SessaoAtiva
from app.services.auth import decode_access_token
from datetime import datetime, timezone

# Precedência numérica das permissões de chat (Local/Sala)
ROLE_WEIGHTS = {
    "view": 1,
    "padrao": 2,
    "mod": 3,
    "admin": 4
}

def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Usuario:
    """
    Extrai o usuário do JWT e verifica sua existência no banco.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autorização ausente ou inválido."
        )
    
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado."
        )
    
    user_id = payload.get("user_id") or payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificador de usuário ausente no token."
        )
    
    try:
        user_uuid = UUID(str(user_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Formato de ID de usuário inválido."
        )
    
    user = db.query(Usuario).filter(Usuario.id == user_uuid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário associado ao token não existe mais."
        )

    # Verificação de Revogação de Sessão (RF01)
    jti = payload.get("jti")
    if jti:
        sessao = db.query(SessaoAtiva).filter(SessaoAtiva.token_jti == jti).first()
        tem_sessoes_registradas = db.query(SessaoAtiva).filter(SessaoAtiva.usuario_id == user.id).first() is not None
        if tem_sessoes_registradas and not sessao:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sessão revogada ou expirada."
            )
        if sessao:
            sessao.last_active_at = datetime.now(timezone.utc)
            db.commit()

    return user


def require_site_admin(user: Usuario = Depends(get_current_user)) -> Usuario:
    """
    Valida permissão global de Admin do Site ('God Mode').
    """
    if not user.is_site_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: Requer privilégios de Administrador do Site."
        )
    return user


def require_chat_role(min_role: str):
    """
    Dependency factory que verifica o cargo do usuário na sala:
    view (1) < padrao (2) < mod (3) < admin (4).
    Herança: Site Admin tem bypass automático ('God Mode').
    """
    if min_role not in ROLE_WEIGHTS:
        raise ValueError(f"Cargo inválido: {min_role}")

    async def _dependency(
        request: Request,
        user: Usuario = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> Tuple[Usuario, Optional[MembroSala]]:
        # 1. Herança Admin: se for Admin do Site, bypass automático
        if user.is_site_admin:
            return user, None

        # 2. Obtém room_id dos parâmetros da rota
        room_id_str = request.path_params.get("room_id")
        if not room_id_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parâmetro room_id não informado na requisição."
            )

        try:
            room_uuid = UUID(str(room_id_str))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="room_id inválido."
            )

        # 3. Localiza entrada em membros_sala
        membro = db.query(MembroSala).filter(
            MembroSala.sala_id == room_uuid,
            MembroSala.usuario_id == user.id
        ).first()

        if not membro:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado: Você não é membro desta sala."
            )

        user_role_weight = ROLE_WEIGHTS.get(membro.role, 0)
        required_weight = ROLE_WEIGHTS.get(min_role, 0)

        if user_role_weight < required_weight:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acesso negado: Cargo insuficiente. Exigido: '{min_role}', seu cargo: '{membro.role}'."
            )

        return user, membro

    return _dependency
