from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, Tuple
import json
import asyncio
import os
import requests
from datetime import datetime, timezone, timedelta
from uuid import UUID
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import Sala, Mensagem, MembroSala, Usuario, Denuncia
from app.schemas.chat import MessageCreate, MessageOut
from app.schemas.rooms import RoomCreate, RoomOut, MemberOut, MemberMuteUpdate, RoomJoinRequest
from app.services.auth import decode_access_token, get_password_hash, verify_password
from app.services.sse import manager
from app.services.storage import validate_and_sanitize_image, upload_image_to_r2
from app.core.security import rate_limiter
from app.core.rbac import get_current_user, require_chat_role, ROLE_WEIGHTS

router = APIRouter(prefix="/chat", tags=["chat"])

class ReactionCreate(BaseModel):
    emoji: str

class ReportCreate(BaseModel):
    mensagem_id: UUID
    sala_id: UUID
    motivo: str

# Helper para compatibilidade legada e nova autenticação
def get_user_or_room_auth(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autorização ausente ou inválido.")
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado.")
    return payload


# --- GESTÃO DE SALAS ---

@router.get("/rooms", response_model=List[RoomOut])
def list_available_rooms(
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista todas as salas que o usuário tem acesso ou salas públicas."""
    membro_salas_ids = set(m.sala_id for m in user.membros)

    if user.is_site_admin:
        salas = db.query(Sala).order_by(Sala.created_at.desc()).all()
    else:
        salas = db.query(Sala).filter(
            (Sala.id.in_(membro_salas_ids)) | 
            ((Sala.is_permanente == True) & (Sala.parent_id.is_(None)))
        ).order_by(Sala.created_at.desc()).all()

    results = []
    for s in salas:
        room_out = RoomOut.model_validate(s)
        room_out.is_membro = (s.id in membro_salas_ids) or user.is_site_admin
        room_out.tem_senha = bool(s.hash_senha)
        results.append(room_out)
    return results


@router.get("/my-rooms", response_model=List[RoomOut])
def list_my_rooms(
    auth: dict = Depends(get_user_or_room_auth),
    db: Session = Depends(get_db)
):
    """Lista apenas as salas onde o usuário autenticado é membro (compatível com tokens legados/guest)."""
    user_id = auth.get("user_id") or auth.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Identificador de usuário ausente no token.")

    try:
        user_uuid = UUID(str(user_id))
    except ValueError:
        raise HTTPException(status_code=401, detail="Formato de ID de usuário inválido.")

    membro_sala_ids = [
        m.sala_id for m in db.query(MembroSala).filter(MembroSala.usuario_id == user_uuid).all()
    ]
    if not membro_sala_ids:
        return []

    salas = db.query(Sala).filter(Sala.id.in_(membro_sala_ids)).order_by(Sala.created_at.desc()).all()
    results = []
    for s in salas:
        room_out = RoomOut.model_validate(s)
        room_out.is_membro = True
        room_out.tem_senha = bool(s.hash_senha)
        results.append(room_out)
    return results


@router.post("/rooms", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_room(
    req: RoomCreate,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Criação de sala:
    - Usuário comum: apenas salas temporárias com TTL (expires_at calculado).
    - Site Admin: pode criar permanentes ou temporárias.
    """
    existing = db.query(Sala).filter(Sala.nome_url == req.nome_url.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Identificador de URL já em uso.")

    tipo = req.tipo_sala or "temporaria"
    if tipo == "permanente" and not user.is_site_admin:
        raise HTTPException(
            status_code=403,
            detail="Apenas Administradores do Site podem criar salas permanentes."
        )

    now = datetime.now(timezone.utc)
    expires_at = None
    is_perm = False

    if tipo == "permanente":
        is_perm = True
    else:
        ttl = req.ttl_minutes if req.ttl_minutes else 1440
        expires_at = now + timedelta(minutes=ttl)

    hashed_senha = get_password_hash(req.senha) if req.senha else None

    room = Sala(
        nome_url=req.nome_url.strip().lower(),
        titulo=req.titulo.strip(),
        hash_senha=hashed_senha,
        parent_id=req.parent_id,
        tipo_sala=tipo,
        is_permanente=is_perm,
        expires_at=expires_at,
        max_membros=req.max_membros or 50,
        created_by=user.id
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    # Criador se torna admin do chat
    membro = MembroSala(
        sala_id=room.id,
        usuario_id=user.id,
        role="admin",
        is_muted=False
    )
    db.add(membro)
    db.commit()

    return room


@router.post("/rooms/{room_id}/join", response_model=MemberOut)
def join_room(
    room_id: UUID,
    req: Optional[RoomJoinRequest] = None,
    senha: Optional[str] = None,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Entrar em uma sala existente como membro padrão."""
    room = db.query(Sala).filter(Sala.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada.")

    # Se a sala tiver senha e o usuário não for site_admin
    senha_informada = (req.senha if req and req.senha is not None else None) or senha
    if room.hash_senha and not user.is_site_admin:
        if not senha_informada:
            raise HTTPException(status_code=403, detail="Esta sala é protegida por senha. Informe a senha de acesso.")
        if not verify_password(senha_informada, room.hash_senha):
            raise HTTPException(status_code=403, detail="Senha da sala incorreta.")

    membro = db.query(MembroSala).filter(
        MembroSala.sala_id == room_id,
        MembroSala.usuario_id == user.id
    ).first()

    if not membro:
        membro = MembroSala(
            sala_id=room_id,
            usuario_id=user.id,
            role="padrao",
            is_muted=False
        )
        db.add(membro)
        db.commit()
        db.refresh(membro)

    return MemberOut(
        id=membro.id,
        sala_id=membro.sala_id,
        usuario_id=membro.usuario_id,
        role=membro.role,
        is_muted=membro.is_muted,
        nickname=user.nickname,
        created_at=membro.created_at
    )


@router.get("/rooms/{room_id}/subrooms", response_model=List[RoomOut])
def get_subrooms(
    room_id: UUID,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Busca recursiva em árvore de canais filhos."""
    membro_salas_ids = set(m.sala_id for m in user.membros)

    def build_tree(parent_uuid: UUID):
        subs = db.query(Sala).filter(Sala.parent_id == parent_uuid).all()
        result = []
        for s in subs:
            s_dict = {
                "id": s.id,
                "nome_url": s.nome_url,
                "titulo": s.titulo,
                "parent_id": s.parent_id,
                "tipo_sala": s.tipo_sala,
                "is_permanente": s.is_permanente,
                "expires_at": s.expires_at,
                "max_membros": s.max_membros,
                "created_by": s.created_by,
                "created_at": s.created_at,
                "tem_senha": bool(s.hash_senha),
                "is_membro": (s.id in membro_salas_ids) or user.is_site_admin,
                "sub_rooms": build_tree(s.id)
            }
            result.append(s_dict)
        return result

    return build_tree(room_id)


@router.post("/rooms/{room_id}/subrooms", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_subroom(
    room_id: UUID,
    req: RoomCreate,
    auth_data: Tuple = Depends(require_chat_role("admin")),
    db: Session = Depends(get_db)
):
    """Criação de sub-canal filho (requer Admin do Chat)."""
    user, _ = auth_data
    parent_room = db.query(Sala).filter(Sala.id == room_id).first()
    if not parent_room:
        raise HTTPException(status_code=404, detail="Sala pai não encontrada.")

    existing = db.query(Sala).filter(Sala.nome_url == req.nome_url.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Identificador de URL já em uso.")

    hashed_senha = get_password_hash(req.senha) if req.senha else None

    subroom = Sala(
        nome_url=req.nome_url.strip().lower(),
        titulo=req.titulo.strip(),
        hash_senha=hashed_senha,
        parent_id=room_id,
        tipo_sala=parent_room.tipo_sala,
        is_permanente=parent_room.is_permanente,
        expires_at=parent_room.expires_at,
        max_membros=req.max_membros or parent_room.max_membros,
        created_by=user.id
    )
    db.add(subroom)
    db.commit()
    db.refresh(subroom)

    # O criador é admin da sub-sala
    db.add(MembroSala(sala_id=subroom.id, usuario_id=user.id, role="admin"))
    db.commit()

    return subroom


# --- MODERAÇÃO DE CHAT (RBAC LOCAL) ---

@router.post("/rooms/{room_id}/members/{user_id}/mute", response_model=MemberOut)
def mute_chat_member(
    room_id: UUID,
    user_id: UUID,
    req: MemberMuteUpdate,
    auth_data: Tuple = Depends(require_chat_role("mod")),
    db: Session = Depends(get_db)
):
    """Mute/unmute local por Moderadores ou Administradores da sala."""
    membro = db.query(MembroSala).filter(
        MembroSala.sala_id == room_id,
        MembroSala.usuario_id == user_id
    ).first()

    if not membro:
        raise HTTPException(status_code=404, detail="Membro não encontrado nesta sala.")

    membro.is_muted = req.is_muted
    db.commit()
    db.refresh(membro)

    user_info = db.query(Usuario).filter(Usuario.id == user_id).first()

    return MemberOut(
        id=membro.id,
        sala_id=membro.sala_id,
        usuario_id=membro.usuario_id,
        role=membro.role,
        is_muted=membro.is_muted,
        nickname=user_info.nickname if user_info else None,
        created_at=membro.created_at
    )


@router.post("/rooms/{room_id}/members/{user_id}/ban")
def ban_chat_member(
    room_id: UUID,
    user_id: UUID,
    auth_data: Tuple = Depends(require_chat_role("admin")),
    db: Session = Depends(get_db)
):
    """Banir/remover membro da sala (restrito a Admin do Chat)."""
    membro = db.query(MembroSala).filter(
        MembroSala.sala_id == room_id,
        MembroSala.usuario_id == user_id
    ).first()

    if not membro:
        raise HTTPException(status_code=404, detail="Membro não encontrado nesta sala.")

    db.delete(membro)
    db.commit()
    return {"message": "Membro banido/removido da sala com sucesso."}


# --- MENSAGENS & SSE ---

@router.get("/rooms/{room_id}/messages", response_model=List[MessageOut])
def get_room_messages(
    room_id: UUID,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 500
):
    """Leitura de mensagens da sala (usuários view, padrao, mod, admin)."""
    if not user.is_site_admin:
        membro = db.query(MembroSala).filter(
            MembroSala.sala_id == room_id,
            MembroSala.usuario_id == user.id
        ).first()
        if not membro:
            raise HTTPException(status_code=403, detail="Você não é membro desta sala.")

    messages = (
        db.query(Mensagem)
        .filter(Mensagem.sala_id == room_id)
        .order_by(Mensagem.created_at.desc())
        .limit(limit)
        .all()
    )
    messages.reverse()
    return messages


@router.post("/rooms/{room_id}/messages", response_model=MessageOut)
async def send_room_message(
    room_id: UUID,
    msg_in: MessageCreate,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Envio de mensagem com validação completa:
    - Requer cargo mínimo 'padrao' (usuário 'view' é proibido de postar).
    - Verifica se o usuário está mutado (localmente ou globalmente).
    - Rate limit de 1 mensagem/segundo.
    """
    # 1. Verifica mute global
    if user.is_muted_global:
        raise HTTPException(status_code=403, detail="Você está silenciado globalmente na plataforma.")

    # 2. Verifica membro e cargo na sala (se não for site admin)
    if not user.is_site_admin:
        membro = db.query(MembroSala).filter(
            MembroSala.sala_id == room_id,
            MembroSala.usuario_id == user.id
        ).first()
        if not membro:
            raise HTTPException(status_code=403, detail="Você não é membro desta sala.")
        
        if membro.is_muted:
            raise HTTPException(status_code=403, detail="Você está silenciado (mutado) nesta sala.")

        if membro.role == "view":
            raise HTTPException(status_code=403, detail="Acesso apenas para visualização. Proibido de enviar mensagens.")

    # 3. Rate limit defensivo: 1 msg/segundo por usuário
    rate_limiter.check_message_rate(str(user.id))

    # 4. Cria e persiste a mensagem
    new_msg = Mensagem(
        sala_id=room_id,
        autor_id=user.id,
        autor_nickname=user.nickname,
        conteudo=msg_in.conteudo,
        reply_to_id=msg_in.reply_to_id,
        reacoes={}
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    # 5. Broadcast em tempo real via SSE
    msg_dict = {
        "type": "new_message",
        "id": str(new_msg.id),
        "sala_id": str(new_msg.sala_id),
        "autor_id": str(new_msg.autor_id),
        "autor_nickname": new_msg.autor_nickname,
        "conteudo": new_msg.conteudo,
        "created_at": new_msg.created_at.isoformat(),
        "reply_to_id": str(new_msg.reply_to_id) if new_msg.reply_to_id else None,
        "reacoes": new_msg.reacoes
    }
    await manager.broadcast_to_room(str(room_id), msg_dict)

    return new_msg


# Rota legada mantida para compatibilidade direta
@router.get("/messages", response_model=List[MessageOut])
def get_messages_legacy(
    auth: dict = Depends(get_user_or_room_auth),
    db: Session = Depends(get_db),
    limit: int = 500
):
    sala_id = auth.get("sala_id")
    if not sala_id:
        raise HTTPException(status_code=400, detail="sala_id não encontrado no token.")

    user_id = auth.get("user_id") or auth.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Identificador de usuário ausente no token.")

    try:
        sala_uuid = UUID(str(sala_id))
        user_uuid = UUID(str(user_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Identificador inválido.")

    user = db.query(Usuario).filter(Usuario.id == user_uuid).first()
    if not (user and user.is_site_admin):
        membro = db.query(MembroSala).filter(
            MembroSala.sala_id == sala_uuid,
            MembroSala.usuario_id == user_uuid
        ).first()
        if not membro:
            raise HTTPException(status_code=403, detail="Você não é membro desta sala.")

    messages = (
        db.query(Mensagem)
        .filter(Mensagem.sala_id == sala_uuid)
        .order_by(Mensagem.created_at.desc())
        .limit(limit)
        .all()
    )
    messages.reverse()
    return messages


@router.post("/messages", response_model=MessageOut)
async def send_message_legacy(
    msg_in: MessageCreate,
    auth: dict = Depends(get_user_or_room_auth),
    db: Session = Depends(get_db)
):
    sala_id = auth.get("sala_id")
    user_id = auth.get("user_id") or auth.get("sub")
    autor_nickname = auth.get("nickname", "Anônimo")

    if not sala_id:
        raise HTTPException(status_code=400, detail="sala_id ausente.")

    if not user_id:
        raise HTTPException(status_code=401, detail="Identificador de usuário ausente no token.")

    try:
        sala_uuid = UUID(str(sala_id))
        autor_uuid = UUID(str(user_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Identificador inválido.")

    user = db.query(Usuario).filter(Usuario.id == autor_uuid).first()
    if user and user.is_muted_global:
        raise HTTPException(status_code=403, detail="Você está mutado globalmente.")

    if not (user and user.is_site_admin):
        membro = db.query(MembroSala).filter(
            MembroSala.sala_id == sala_uuid,
            MembroSala.usuario_id == autor_uuid
        ).first()
        if not membro:
            raise HTTPException(status_code=403, detail="Você não é membro desta sala.")
        if membro.is_muted:
            raise HTTPException(status_code=403, detail="Você está mutado nesta sala.")
        if membro.role == "view":
            raise HTTPException(status_code=403, detail="Usuário com perfil view não pode enviar mensagens.")

    new_msg = Mensagem(
        sala_id=UUID(str(sala_id)),
        autor_id=autor_uuid,
        autor_nickname=autor_nickname,
        conteudo=msg_in.conteudo,
        reply_to_id=msg_in.reply_to_id
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    msg_dict = {
        "type": "new_message",
        "id": str(new_msg.id),
        "sala_id": str(new_msg.sala_id),
        "autor_nickname": new_msg.autor_nickname,
        "conteudo": new_msg.conteudo,
        "created_at": new_msg.created_at.isoformat(),
        "reply_to_id": str(new_msg.reply_to_id) if new_msg.reply_to_id else None,
        "reacoes": new_msg.reacoes
    }
    await manager.broadcast_to_room(str(sala_id), msg_dict)
    return new_msg


@router.post("/messages/{message_id}/react")
async def react_to_message(
    message_id: UUID,
    reaction: ReactionCreate,
    auth: dict = Depends(get_user_or_room_auth),
    db: Session = Depends(get_db)
):
    nickname = auth.get("nickname", "Usuário")
    msg = db.query(Mensagem).filter(Mensagem.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")

    reacoes = dict(msg.reacoes) if msg.reacoes else {}
    emoji = reaction.emoji

    if emoji not in reacoes:
        reacoes[emoji] = []
    
    if nickname in reacoes[emoji]:
        reacoes[emoji].remove(nickname)
        if not reacoes[emoji]:
            del reacoes[emoji]
    else:
        reacoes[emoji].append(nickname)

    msg.reacoes = reacoes
    db.commit()
    db.refresh(msg)

    event_data = {
        "type": "reaction_update",
        "message_id": str(msg.id),
        "reacoes": msg.reacoes
    }
    await manager.broadcast_to_room(str(msg.sala_id), event_data)
    return msg


@router.get("/stream")
async def chat_stream(
    request: Request,
    token: str,
    room_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido.")
    
    sala_id = room_id or payload.get("sala_id")
    if not sala_id:
        raise HTTPException(status_code=400, detail="sala_id não informado.")

    user_id = payload.get("user_id") or payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Identificador de usuário ausente no token.")

    try:
        sala_uuid = UUID(str(sala_id))
        user_uuid = UUID(str(user_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Identificador inválido.")

    # Validar se o usuário é membro da sala ou site admin
    user = db.query(Usuario).filter(Usuario.id == user_uuid).first()
    if not (user and user.is_site_admin):
        membro = db.query(MembroSala).filter(
            MembroSala.sala_id == sala_uuid,
            MembroSala.usuario_id == user_uuid
        ).first()
        if not membro:
            raise HTTPException(status_code=403, detail="Você não é membro desta sala.")

    queue = await manager.connect(str(sala_id))

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            manager.disconnect(str(sala_id), queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    auth: dict = Depends(get_user_or_room_auth)
):
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Arquivo excede o limite máximo permitido de 5MB.")

    # Validação rigorosa por Magic Bytes reais e sanitização EXIF
    sanitized_bytes, real_mime, extension = validate_and_sanitize_image(contents, file.filename or "upload.jpg")

    # Tentativa de upload para Cloudflare R2
    try:
        url = await upload_image_to_r2(sanitized_bytes, file.filename or f"img.{extension}", real_mime)
        return {"url": url}
    except Exception as e:
        # Fallback para ImgBB se R2 não estiver configurado
        api_key = os.getenv("IMGBB_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail=f"Storage indisponível: {e}")

        url_imgbb = "https://api.imgbb.com/1/upload"
        payload = {"key": api_key}
        files = {"image": (file.filename, sanitized_bytes, real_mime)}
        resp = requests.post(url_imgbb, data=payload, files=files)
        if resp.status_code == 200:
            return {"url": resp.json()["data"]["url"]}
        raise HTTPException(status_code=500, detail="Erro no upload de mídia.")


@router.post("/reports", status_code=status.HTTP_201_CREATED)
def create_report(
    req: ReportCreate,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    report = Denuncia(
        denunciante_id=user.id,
        mensagem_id=req.mensagem_id,
        sala_id=req.sala_id,
        motivo=req.motivo.strip()
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"message": "Denúncia registrada com sucesso.", "id": str(report.id)}