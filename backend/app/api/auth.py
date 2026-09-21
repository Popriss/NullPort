from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID, uuid4
import secrets
import hashlib
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.models.models import Usuario, Sala, MembroSala, SessaoAtiva, CodigoOTP, Mensagem
from app.schemas.auth import (
    UserRegisterRequest,
    UserLoginRequest,
    UserOut,
    UserTokenResponse,
    RoomEnterRequest,
    TokenResponse,
    UserDeleteRequest,
    OTPSendRequest,
    OTPVerifyRequest,
    SessionOut,
    PublicKeyUpdateRequest
)
from app.services.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_access_token
)
from app.services.purge import cleanup_message_media
from app.core.security import rate_limiter
from app.core.rbac import get_current_user
from app.core.sms import sms_provider

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


def record_session(db: Session, user_id: UUID, jti: str, request: Request) -> SessaoAtiva:
    """Registra uma nova sessão ativa de dispositivo (RF01)."""
    user_agent = request.headers.get("user-agent", "Desconhecido")
    client_ip = request.client.host if request.client else "127.0.0.1"

    # Nome amigável básico para o dispositivo
    device_name = "Navegador Web"
    ua_lower = user_agent.lower()
    if "mobile" in ua_lower or "android" in ua_lower or "iphone" in ua_lower:
        device_name = "Dispositivo Móvel"
    elif "macintosh" in ua_lower or "mac os" in ua_lower:
        device_name = "Mac OS"
    elif "windows" in ua_lower:
        device_name = "Windows PC"
    elif "linux" in ua_lower:
        device_name = "Linux PC"

    sessao = SessaoAtiva(
        usuario_id=user_id,
        device_name=device_name,
        ip_address=client_ip,
        user_agent=user_agent[:500],
        token_jti=jti
    )
    db.add(sessao)
    db.commit()
    db.refresh(sessao)
    return sessao


@router.post("/register", response_model=UserTokenResponse, status_code=status.HTTP_201_CREATED)
def register_user(req: UserRegisterRequest, request: Request, db: Session = Depends(get_db)):
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

    clean_tel = req.telefone.strip() if req.telefone else None
    if clean_tel:
        existing_tel = db.query(Usuario).filter(Usuario.telefone == clean_tel).first()
        if existing_tel:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Número de telefone já cadastrado."
            )

    # Cria o novo usuário
    hashed_password = get_password_hash(req.senha)
    user = Usuario(
        nickname=req.nickname.strip(),
        email=req.email.lower().strip(),
        senha_hash=hashed_password,
        telefone=clean_tel,
        is_site_admin=bool(req.is_site_admin)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Emite o token JWT seguro com JTI
    jti = uuid4().hex
    token_data = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "nickname": user.nickname,
        "is_site_admin": user.is_site_admin,
        "jti": jti
    }
    access_token = create_access_token(token_data)
    record_session(db, user.id, jti, request)

    return UserTokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user
    )


@router.post("/login", response_model=UserTokenResponse)
def login_user(req: UserLoginRequest, request: Request, db: Session = Depends(get_db)):
    login_id = req.login.strip().lower()

    # Validação de Rate Limiting
    rate_limiter.check_login_rate(login_id, max_attempts=5, window_seconds=60)

    # Busca usuário por e-mail, nickname ou telefone
    user = db.query(Usuario).filter(
        (Usuario.email == login_id) | 
        (Usuario.nickname == req.login.strip()) |
        (Usuario.telefone == req.login.strip())
    ).first()

    if not user or not verify_password(req.senha, user.senha_hash):
        rate_limiter.record_login_failure(login_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas. Verifique seu login e senha."
        )

    # Limpa falhas anteriores ao autenticar com sucesso
    rate_limiter.clear_login_failures(login_id)

    # Gera token JWT com rastreamento de sessão
    jti = uuid4().hex
    token_data = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "nickname": user.nickname,
        "is_site_admin": user.is_site_admin,
        "jti": jti
    }
    access_token = create_access_token(token_data)
    record_session(db, user.id, jti, request)

    return UserTokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user
    )


@router.get("/me", response_model=UserOut)
def get_me(user: Usuario = Depends(get_current_user)):
    return user


# --- RF01: AUTENTICAÇÃO SMS OTP & GESTÃO MULTIDISPOSITIVO ---

@router.post("/otp/send")
async def send_otp_code(req: OTPSendRequest, db: Session = Depends(get_db)):
    """Gera e envia código SMS OTP para o telefone informado (RF01)."""
    clean_phone = req.telefone.strip()
    if len(clean_phone) < 8:
        raise HTTPException(status_code=400, detail="Número de telefone inválido.")

    # Gera código numérico de 6 dígitos
    code = f"{secrets.randbelow(900000) + 100000}"
    code_hash = hashlib.sha256(code.encode('utf-8')).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

    # Remove códigos expirados para o número
    db.query(CodigoOTP).filter(CodigoOTP.telefone == clean_phone).delete()

    novo_otp = CodigoOTP(
        telefone=clean_phone,
        codigo_hash=code_hash,
        expires_at=expires_at,
        tentativas=0
    )
    db.add(novo_otp)
    db.commit()

    sent = await sms_provider.send_otp(clean_phone, code)
    if not sent:
        raise HTTPException(status_code=500, detail="Falha no envio do SMS de verificação.")

    return {"message": "Código de verificação enviado com sucesso.", "expires_in_seconds": 300}


@router.post("/otp/verify", response_model=UserTokenResponse)
def verify_otp_code(req: OTPVerifyRequest, request: Request, db: Session = Depends(get_db)):
    """Verifica código OTP, autentica ou cadastra o usuário e inicia sessão (RF01)."""
    clean_phone = req.telefone.strip()
    code_hash = hashlib.sha256(req.codigo.strip().encode('utf-8')).hexdigest()
    now = datetime.now(timezone.utc)

    otp_record = db.query(CodigoOTP).filter(CodigoOTP.telefone == clean_phone).first()
    if not otp_record:
        raise HTTPException(status_code=400, detail="Nenhum código solicitado para este telefone.")

    if otp_record.expires_at < now:
        db.delete(otp_record)
        db.commit()
        raise HTTPException(status_code=400, detail="Código de verificação expirado. Solicite outro.")

    if otp_record.tentativas >= 3:
        db.delete(otp_record)
        db.commit()
        raise HTTPException(status_code=400, detail="Limite de tentativas excedido. Solicite novo código.")

    if otp_record.codigo_hash != code_hash:
        otp_record.tentativas += 1
        db.commit()
        raise HTTPException(status_code=400, detail=f"Código inválido. Tentativa {otp_record.tentativas}/3.")

    # Código correto: consome o OTP
    db.delete(otp_record)
    db.commit()

    # Busca ou cria o usuário correspondente ao telefone
    user = db.query(Usuario).filter(Usuario.telefone == clean_phone).first()
    if not user:
        raw_nick = req.nickname.strip() if req.nickname else f"User_{clean_phone[-4:]}"
        # Garante unicidade do nickname
        existing = db.query(Usuario).filter(Usuario.nickname == raw_nick).first()
        if existing:
            raw_nick = f"{raw_nick}_{uuid4().hex[:4]}"

        user = Usuario(
            nickname=raw_nick,
            email=f"{clean_phone}@sms.nullport",
            senha_hash=get_password_hash(uuid4().hex),
            telefone=clean_phone
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    jti = uuid4().hex
    token_data = {
        "sub": str(user.id),
        "user_id": str(user.id),
        "nickname": user.nickname,
        "is_site_admin": user.is_site_admin,
        "jti": jti
    }
    access_token = create_access_token(token_data)
    record_session(db, user.id, jti, request)

    return UserTokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user
    )


@router.get("/sessions", response_model=List[SessionOut])
def list_my_sessions(
    payload: dict = Depends(get_current_user_payload),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista todas as sessões ativas do usuário e identifica o dispositivo atual (RF01)."""
    current_jti = payload.get("jti")
    sessoes = db.query(SessaoAtiva).filter(SessaoAtiva.usuario_id == user.id).order_by(SessaoAtiva.last_active_at.desc()).all()
    
    results = []
    for s in sessoes:
        out = SessionOut.model_validate(s)
        out.is_current = (s.token_jti == current_jti)
        results.append(out)
    return results


@router.delete("/sessions/{session_id}")
def revoke_session(
    session_id: UUID,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Revoga uma sessão específica, desconectando o dispositivo remotamente (RF01)."""
    sessao = db.query(SessaoAtiva).filter(
        SessaoAtiva.id == session_id,
        SessaoAtiva.usuario_id == user.id
    ).first()

    if not sessao:
        raise HTTPException(status_code=404, detail="Sessão não encontrada ou não pertence a este usuário.")

    db.delete(sessao)
    db.commit()
    return {"message": "Sessão revogada com sucesso. Dispositivo desconectado."}


@router.delete("/sessions/revoke/others")
def revoke_other_sessions(
    payload: dict = Depends(get_current_user_payload),
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Desconecta todos os outros dispositivos logados, mantendo apenas a sessão atual (RF01)."""
    current_jti = payload.get("jti")
    if not current_jti:
        raise HTTPException(status_code=400, detail="Sessão atual não identificada.")

    outras = db.query(SessaoAtiva).filter(
        SessaoAtiva.usuario_id == user.id,
        SessaoAtiva.token_jti != current_jti
    ).all()

    count = len(outras)
    for s in outras:
        db.delete(s)
    db.commit()

    return {"message": f"{count} outras sessões foram revogadas com sucesso."}


# --- RN01: CHAVE PÚBLICA E2EE ---

@router.put("/public-key")
def update_public_key(
    req: PublicKeyUpdateRequest,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Registra a chave pública do usuário para negociação E2EE (RN01)."""
    user.public_key_e2ee = req.public_key_e2ee.strip()
    db.commit()
    return {"message": "Chave pública E2EE atualizada com sucesso."}


@router.get("/users/{user_id}/public-key")
def get_user_public_key(
    user_id: UUID,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtém a chave pública de um usuário para cifragem ponta a ponta (RN01)."""
    alvo = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not alvo:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return {
        "usuario_id": str(alvo.id),
        "nickname": alvo.nickname,
        "public_key_e2ee": alvo.public_key_e2ee
    }


# --- RN06: DIREITO AO ESQUECIMENTO / EXCLUSÃO LGPD ---

@router.delete("/me")
def delete_account_lgpd(
    req: UserDeleteRequest,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Exclusão definitiva e irreversível da conta e todos os dados associados (RN06 - LGPD).
    Executa Hard Wipe nas mídias enviadas pelo usuário e purga todas as salas criadas.
    """
    if not verify_password(req.senha, user.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Senha incorreta. Não foi possível confirmar a exclusão da conta."
        )

    # 1. Hard wipe nas mídias de todas as mensagens do usuário
    user_msgs = db.query(Mensagem).filter(Mensagem.autor_id == user.id).all()
    for msg in user_msgs:
        cleanup_message_media(msg.conteudo)

    # 2. Hard wipe nas salas criadas pelo usuário
    for sala in user.salas_criadas:
        sala_msgs = db.query(Mensagem).filter(Mensagem.sala_id == sala.id).all()
        for sm in sala_msgs:
            cleanup_message_media(sm.conteudo)
        db.delete(sala)

    # 3. Exclusão do usuário (em cascata, remove membros_sala, sessoes, bloqueios e denuncias)
    db.delete(user)
    db.commit()

    return {"message": "Sua conta e todos os dados associados foram excluídos definitivamente conforme a LGPD."}


@router.get("/me/export")
def export_user_data_lgpd(
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Portabilidade de Dados Pessoais (RN06 - LGPD Art. 18).
    Exporta todos os dados cadastrais e vínculos do operador em formato aberto JSON.
    """
    sessoes = db.query(SessaoAtiva).filter(SessaoAtiva.usuario_id == user.id).all()
    salas = db.query(Sala).filter(Sala.criador_id == user.id).all()
    total_mensagens = db.query(Mensagem).filter(Mensagem.autor_id == user.id).count()

    return {
        "export_metadata": {
            "plataforma": "NullPort Protocol",
            "conformidade": "LGPD (Lei 13.709/2018) Art. 18 / GDPR",
            "gerado_em": datetime.now(timezone.utc).isoformat(),
        },
        "perfil_operador": {
            "id": str(user.id),
            "nickname": user.nickname,
            "email": user.email,
            "telefone": user.telefone,
            "role": user.role,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "has_e2ee_key": bool(user.public_key_e2ee)
        },
        "sessoes_ativas": [
            {
                "id": str(s.id),
                "device_name": s.device_name,
                "ip_address": s.ip_address,
                "last_active_at": s.last_active_at.isoformat() if s.last_active_at else None,
                "created_at": s.created_at.isoformat() if s.created_at else None
            }
            for s in sessoes
        ],
        "salas_criadas": [
            {
                "id": str(sala.id),
                "nome": sala.nome,
                "nome_url": sala.nome_url,
                "is_secret_mode": sala.is_secret_mode,
                "created_at": sala.created_at.isoformat() if sala.created_at else None
            }
            for sala in salas
        ],
        "estatisticas": {
            "total_mensagens_enviadas": total_mensagens
        }
    }


# --- COMPATIBILIDADE LEGADA: SALAS ZERO-LOGIN ---

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
