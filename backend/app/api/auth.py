from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID, uuid4

from app.core.database import get_db
from app.models.models import Usuario, Sala, MembroSala
from app.schemas.auth import (
    UserRegisterRequest,
    UserLoginRequest,
    UserOut,
    UserTokenResponse,
    RoomEnterRequest,
    TokenResponse
)
from app.services.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_access_token
)
from app.core.security import rate_limiter

router = APIRouter(prefix="/auth", tags=["auth"])

def get_current_user_payload(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autorização ausente ou malformado."
        )
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado."
        )
    return payload

@router.post("/register", response_model=UserTokenResponse, status_code=status.HTTP_201_CREATED)
def register_user(req: UserRegisterRequest, db: Session = Depends(get_db)):
    # Verifica se o nickname ou email já estão em uso
    existing_user = db.query(Usuario).filter(
        (Usuario.email == req.email.lower().strip()) | 
        (Usuario.nickname == req.nickname.strip())
    ).first()
    
    if existing_user:
        if existing_user.email == req.email.lower().strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email já cadastrado na plataforma."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nickname já em uso. Escolha outro."
            )

    # Cria o novo usuário
    hashed_password = get_password_hash(req.senha)
    user = Usuario(
        nickname=req.nickname.strip(),
        email=req.email.lower().strip(),
        senha_hash=hashed_password,
        is_site_admin=bool(req.is_site_admin)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Emite o token JWT seguro
    token_data = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "nickname": user.nickname,
        "is_site_admin": user.is_site_admin
    }
    access_token = create_access_token(token_data)

    return UserTokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user
    )


@router.post("/login", response_model=UserTokenResponse)
def login_user(req: UserLoginRequest, db: Session = Depends(get_db)):
    login_id = req.login.strip().lower()

    # Validação de Rate Limiting (bloqueia se houver 5 tentativas falhas consecutivas dentro de 1 minuto)
    rate_limiter.check_login_rate(login_id, max_attempts=5, window_seconds=60)

    # Busca usuário por e-mail ou nickname
    user = db.query(Usuario).filter(
        (Usuario.email == login_id) | 
        (Usuario.nickname == req.login.strip())
    ).first()

    if not user or not verify_password(req.senha, user.senha_hash):
        rate_limiter.record_login_failure(login_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas. Verifique seu login e senha."
        )

    # Limpa falhas anteriores ao autenticar com sucesso
    rate_limiter.clear_login_failures(login_id)

    # Gera token JWT
    token_data = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "nickname": user.nickname,
        "is_site_admin": user.is_site_admin
    }
    access_token = create_access_token(token_data)

    return UserTokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user
    )


@router.get("/me", response_model=UserOut)
def get_me(payload: dict = Depends(get_current_user_payload), db: Session = Depends(get_db)):
    user_id = payload.get("user_id") or payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido: identificador de usuário não encontrado."
        )

    try:
        user_uuid = UUID(str(user_id))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identificador de usuário com formato inválido."
        )

    user = db.query(Usuario).filter(Usuario.id == user_uuid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado."
        )

    return user


# Helper: garante que o usuário seja membro da sala (tabela pivô membros_sala)
def ensure_room_membership(db: Session, sala_id: UUID, usuario_id: UUID, role: str = "padrao"):
    membro = db.query(MembroSala).filter(
        MembroSala.sala_id == sala_id,
        MembroSala.usuario_id == usuario_id
    ).first()
    if not membro:
        membro = MembroSala(
            sala_id=sala_id,
            usuario_id=usuario_id,
            role=role,
            is_muted=False
        )
        db.add(membro)
        db.commit()
        db.refresh(membro)
    return membro


# Compatibilidade legada para acesso direto a salas (Zero-Login)
@router.post("/room", response_model=TokenResponse)
def enter_or_create_room(req: RoomEnterRequest, db: Session = Depends(get_db)):
    room = db.query(Sala).filter(Sala.nome_url == req.nome_url).first()

    if room:
        if room.hash_senha and not verify_password(req.senha or "", room.hash_senha):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Senha incorreta para esta sala."
            )
    else:
        hashed = get_password_hash(req.senha) if req.senha else None
        room = Sala(nome_url=req.nome_url, titulo=req.nome_url, hash_senha=hashed)
        db.add(room)
        db.commit()
        db.refresh(room)

    # Cria/Busca usuário convidado (Guest) para acesso sem login global
    raw_nick = req.nickname.strip() if req.nickname else f'Anon_{str(uuid4())[:6]}'
    user = db.query(Usuario).filter(Usuario.nickname == raw_nick).first()
    if user and not user.is_guest:
        raw_nick = f'{raw_nick}_{str(uuid4())[:4]}'
        user = None
    if not user:
        guest_email = f"{raw_nick.lower().replace(' ', '_')}_{str(uuid4())[:8]}@guest.nullport"
        user = Usuario(
            nickname=raw_nick,
            email=guest_email,
            senha_hash='',
            is_guest=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Garante a vinculação na tabela pivô membros_sala
    ensure_room_membership(db, room.id, user.id, role='padrao')

    token_data = {
        'sub': str(user.id),
        'user_id': str(user.id),
        'sala_id': str(room.id),
        'nickname': user.nickname
    }
    access_token = create_access_token(token_data)

    return TokenResponse(
        access_token=access_token,
        token_type='bearer',
        user_id=str(user.id),
        sala_id=str(room.id),
        nickname=user.nickname,
        nome_url=room.nome_url
    )
