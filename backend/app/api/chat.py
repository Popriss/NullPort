from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Request, status, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, Tuple
import json
import asyncio
import os
import re
import requests
from datetime import datetime, timezone, timedelta
from uuid import UUID
from pydantic import BaseModel

from app.core.database import get_db
from app.models.models import Sala, Mensagem, MembroSala, Usuario, Denuncia, AuditLog, BloqueioUsuario, ReciboMensagem
from app.schemas.chat import MessageCreate, MessageOut, BlockedUserOut, ReportCreate, ReactionCreate
from app.schemas.rooms import RoomCreate, RoomOut, MemberOut, MemberMuteUpdate, MemberRoleUpdate, RoomJoinRequest, RoomJoinByUrlRequest
from app.services.auth import decode_access_token, get_password_hash, verify_password
from app.services.sse import manager
from app.services.storage import validate_and_sanitize_image, upload_image_to_r2
from app.services.purge import cleanup_message_media
from app.services.export import export_room_history_encrypted
from app.core.security import rate_limiter
from app.core.rbac import get_current_user, require_chat_role, ROLE_WEIGHTS

router = APIRouter(prefix="/chat", tags=["chat"])

def extract_mentions(content: str) -> List[str]:
    """Extrai todos os nicknames mencionados no padrão @nickname."""
    if not content:
        return []
    matches = re.findall(r"@([a-zA-Z0-9_.-]+)", content)
    seen = set()
    result = []
    for nick in matches:
        clean_nick = nick.strip()
        if clean_nick and clean_nick.lower() not in seen:
            seen.add(clean_nick.lower())
            result.append(clean_nick)
    return result



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


def ensure_room_membership(db: Session, sala_id: UUID, usuario_id: UUID, role: str = "padrao") -> MembroSala:
    """
    Garante que o usuário seja membro da sala (tabela pivô membros_sala).
    Registra a presença do usuário sempre que ele ingressar ou acessar uma sala.
    """
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


# --- GESTÃO DE SALAS ---

@router.get("/rooms", response_model=List[RoomOut])
def list_available_rooms(
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista todas as salas acessíveis (zero-discovery para usuários comuns, todas para site_admin)."""
    membro_salas_ids = set(m.sala_id for m in user.membros)

    if user.is_site_admin:
        salas = db.query(Sala).order_by(Sala.created_at.desc()).all()
    else:
        salas = (
            db.query(Sala)
            .join(MembroSala, Sala.id == MembroSala.sala_id)
            .filter(MembroSala.usuario_id == user.id)
            .order_by(Sala.created_at.desc())
            .all()
        )

    results = []
    for s in salas:
        room_out = RoomOut.model_validate(s)
        room_out.is_membro = (s.id in membro_salas_ids) or user.is_site_admin
        room_out.tem_senha = bool(s.hash_senha)
        results.append(room_out)
    return results


@router.get("/my-rooms", response_model=List[RoomOut])
def list_my_rooms(
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Lista EXCLUSIVAMENTE as salas onde o usuário logado é membro ativo.
    Salas de outros grupos ou públicas só são visíveis se is_site_admin == True.
    """
    membro_salas_ids = set(m.sala_id for m in user.membros)

    if user.is_site_admin:
        salas = db.query(Sala).order_by(Sala.created_at.desc()).all()
    else:
        salas = (
            db.query(Sala)
            .join(MembroSala, Sala.id == MembroSala.sala_id)
            .filter(MembroSala.usuario_id == user.id)
            .order_by(Sala.created_at.desc())
            .all()
        )

    results = []
    for s in salas:
        room_out = RoomOut.model_validate(s)
        room_out.is_membro = (s.id in membro_salas_ids) or user.is_site_admin
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
    - Vincula o criador automaticamente como admin do chat na tabela membros_sala.
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
        is_secret_mode=bool(req.is_secret_mode),
        expires_at=expires_at,
        max_membros=req.max_membros or 50,
        created_by=user.id
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    # Criador se torna admin do chat
    ensure_room_membership(db, room.id, user.id, role="admin")

    # Registra ação na trilha de auditoria
    db.add(AuditLog(
        sala_id=room.id,
        usuario_id=user.id,
        actor_nickname=user.nickname,
        action="create_room",
        target_id=str(room.id),
        target_nickname=room.titulo or room.nome_url,
        detalhes={
            "tipo_sala": tipo,
            "is_permanente": is_perm,
            "nome_url": room.nome_url
        }
    ))
    db.commit()

    room_out = RoomOut.model_validate(room)
    room_out.is_membro = True
    room_out.tem_senha = bool(room.hash_senha)
    return room_out


@router.delete("/rooms/{room_id}")
def delete_room(
    room_id: UUID,
    auth_data: Tuple = Depends(require_chat_role("admin")),
    db: Session = Depends(get_db)
):
    """Exclui sala, sub-canal ou sala temporária (restrito a Admin do Chat ou Site Admin)."""
    user, _ = auth_data
    room = db.query(Sala).filter(Sala.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada.")

    action_type = "delete_subroom" if room.parent_id else "delete_room"
    room_title = room.titulo or room.nome_url

    # Grava na trilha de auditoria imutável antes da deleção
    audit_log = AuditLog(
        sala_id=room.id,
        usuario_id=user.id,
        actor_nickname=user.nickname,
        action=action_type,
        target_id=str(room.id),
        target_nickname=room_title,
        detalhes={
            "nome_url": room.nome_url,
            "tipo_sala": room.tipo_sala,
            "parent_id": str(room.parent_id) if room.parent_id else None
        }
    )
    db.add(audit_log)
    db.commit()

    db.delete(room)
    db.commit()

    return {"message": f"Sala '{room_title}' excluída com sucesso."}



@router.post("/rooms/join-by-url", response_model=RoomOut)
@router.post("/rooms/join", response_model=RoomOut)
def join_room_by_url(
    req: RoomJoinByUrlRequest,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Acessar sala existente informando o Identificador (URL) e a Senha.
    Valida credenciais e vincula o usuário como membro na tabela membros_sala.
    """
    clean_url = req.nome_url.strip().lower().lstrip("#")
    room = db.query(Sala).filter(Sala.nome_url == clean_url).first()
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada com o identificador informado.")

    # Se a sala for protegida por senha e o usuário não for site_admin
    if room.hash_senha and not user.is_site_admin:
        if not req.senha:
            raise HTTPException(status_code=403, detail="Esta sala é protegida por senha. Informe a senha de acesso.")
        if not verify_password(req.senha, room.hash_senha):
            raise HTTPException(status_code=403, detail="Senha da sala incorreta.")

    # Vincula o usuário como membro se ainda não for
    ensure_room_membership(db, room.id, user.id, role="padrao")

    room_out = RoomOut.model_validate(room)
    room_out.is_membro = True
    room_out.tem_senha = bool(room.hash_senha)
    return room_out


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

    membro = ensure_room_membership(db, room_id, user.id, role="padrao")

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
    """Busca recursiva em árvore de canais filhos (respeitando zero-discovery)."""
    membro_salas_ids = set(m.sala_id for m in user.membros)

    def build_tree(parent_uuid: UUID):
        query = db.query(Sala).filter(Sala.parent_id == parent_uuid)
        if not user.is_site_admin:
            query = query.filter(Sala.id.in_(membro_salas_ids))
        subs = query.all()
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
    ensure_room_membership(db, subroom.id, user.id, role="admin")

    # Registra ação na trilha de auditoria
    db.add(AuditLog(
        sala_id=subroom.id,
        usuario_id=user.id,
        actor_nickname=user.nickname,
        action="create_subroom",
        target_id=str(subroom.id),
        target_nickname=subroom.titulo or subroom.nome_url,
        detalhes={
            "parent_id": str(room_id),
            "nome_url": subroom.nome_url
        }
    ))
    db.commit()

    subroom_out = RoomOut.model_validate(subroom)

    subroom_out.is_membro = True
    subroom_out.tem_senha = bool(subroom.hash_senha)
    return subroom_out


# --- MODERAÇÃO DE CHAT (RBAC LOCAL & PRESENÇA) ---

@router.get("/rooms/{room_id}/members", response_model=List[MemberOut])
def get_room_members(
    room_id: UUID,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Lista todos os membros cadastrados na sala com status de presença (is_online).
    Restrito a membros da sala ou site admins.
    Ordenação: Admins primeiro, seguido de Mods, Usuários Online e Usuários Offline.
    """
    # Validação RBAC: deve pertencer à sala ou ser admin global
    if not current_user.is_site_admin:
        membro_solicitante = db.query(MembroSala).filter(
            MembroSala.sala_id == room_id,
            MembroSala.usuario_id == current_user.id
        ).first()
        if not membro_solicitante:
            raise HTTPException(status_code=403, detail="Você não pertence a esta sala.")

    membros = (
        db.query(MembroSala, Usuario)
        .join(Usuario, MembroSala.usuario_id == Usuario.id)
        .filter(MembroSala.sala_id == room_id)
        .all()
    )

    online_user_ids = manager.get_online_user_ids(str(room_id))

    response = []
    for membro, usuario in membros:
        is_online = (str(usuario.id) in online_user_ids) or (usuario.id in online_user_ids)
        response.append(MemberOut(
            id=membro.id,
            sala_id=membro.sala_id,
            usuario_id=membro.usuario_id,
            role=membro.role,
            is_muted=membro.is_muted,
            nickname=usuario.nickname,
            is_online=is_online,
            created_at=membro.created_at
        ))

    # Ordenação: Admins primeiro, seguido de Mods, Usuários Online e Usuários Offline
    role_order = {"admin": 0, "mod": 1, "padrao": 2, "view": 3}
    response.sort(key=lambda m: (
        role_order.get(m.role, 99),
        0 if m.is_online else 1,
        (m.nickname or "").lower()
    ))

    return response


@router.post("/rooms/{room_id}/members/{user_id}/mute", response_model=MemberOut)
async def mute_chat_member(
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

    actor_user, _ = auth_data
    target_user = db.query(Usuario).filter(Usuario.id == user_id).first()
    db.add(AuditLog(
        sala_id=room_id,
        usuario_id=actor_user.id,
        actor_nickname=actor_user.nickname,
        action="mute_member" if req.is_muted else "unmute_member",
        target_id=str(user_id),
        target_nickname=target_user.nickname if target_user else None,
        detalhes={"is_muted": req.is_muted}
    ))
    db.commit()
    db.refresh(membro)

    user_info = target_user or db.query(Usuario).filter(Usuario.id == user_id).first()
    online_user_ids = manager.get_online_user_ids(str(room_id))
    is_online = (str(user_id) in online_user_ids) or (user_id in online_user_ids)

    member_out = MemberOut(
        id=membro.id,
        sala_id=membro.sala_id,
        usuario_id=membro.usuario_id,
        role=membro.role,
        is_muted=membro.is_muted,
        nickname=user_info.nickname if user_info else None,
        is_online=is_online,
        created_at=membro.created_at
    )

    await manager.broadcast_to_room(str(room_id), {
        "type": "member_update",
        "member": member_out.model_dump(mode="json")
    })

    return member_out


@router.post("/rooms/{room_id}/members/{user_id}/role", response_model=MemberOut)
async def update_chat_member_role(
    room_id: UUID,
    user_id: UUID,
    req: MemberRoleUpdate,
    auth_data: Tuple = Depends(require_chat_role("admin")),
    db: Session = Depends(get_db)
):
    """Alterar cargo de um membro da sala (restrito a Admin do Chat ou Site Admin)."""
    valid_roles = ["admin", "mod", "padrao", "view"]
    if req.role not in valid_roles:
        raise HTTPException(status_code=400, detail=f"Cargo inválido. Use um dos seguintes: {', '.join(valid_roles)}")

    membro = db.query(MembroSala).filter(
        MembroSala.sala_id == room_id,
        MembroSala.usuario_id == user_id
    ).first()

    if not membro:
        raise HTTPException(status_code=404, detail="Membro não encontrado nesta sala.")

    old_role = membro.role
    membro.role = req.role

    actor_user, _ = auth_data
    target_user = db.query(Usuario).filter(Usuario.id == user_id).first()
    db.add(AuditLog(
        sala_id=room_id,
        usuario_id=actor_user.id,
        actor_nickname=actor_user.nickname,
        action="role_change",
        target_id=str(user_id),
        target_nickname=target_user.nickname if target_user else None,
        detalhes={
            "old_role": old_role,
            "new_role": req.role
        }
    ))
    db.commit()
    db.refresh(membro)

    user_info = target_user or db.query(Usuario).filter(Usuario.id == user_id).first()
    online_user_ids = manager.get_online_user_ids(str(room_id))
    is_online = (str(user_id) in online_user_ids) or (user_id in online_user_ids)

    member_out = MemberOut(
        id=membro.id,
        sala_id=membro.sala_id,
        usuario_id=membro.usuario_id,
        role=membro.role,
        is_muted=membro.is_muted,
        nickname=user_info.nickname if user_info else None,
        is_online=is_online,
        created_at=membro.created_at
    )

    await manager.broadcast_to_room(str(room_id), {
        "type": "member_update",
        "member": member_out.model_dump(mode="json")
    })

    return member_out


@router.post("/rooms/{room_id}/members/{user_id}/ban")
async def ban_chat_member(
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

    actor_user, _ = auth_data
    target_user = db.query(Usuario).filter(Usuario.id == user_id).first()
    db.add(AuditLog(
        sala_id=room_id,
        usuario_id=actor_user.id,
        actor_nickname=actor_user.nickname,
        action="ban_member",
        target_id=str(user_id),
        target_nickname=target_user.nickname if target_user else None,
        detalhes={"action": "ban"}
    ))

    db.delete(membro)
    db.commit()

    await manager.broadcast_to_room(str(room_id), {
        "type": "member_removed",
        "user_id": str(user_id)
    })

    return {"message": "Membro banido/removido da sala com sucesso."}


# --- RECURSOS V3: DIGITAÇÃO & EXPORTAÇÃO CRIPTOGRAFADA ---

class TypingEventRequest(BaseModel):
    is_typing: bool = True

@router.post("/rooms/{room_id}/typing")
async def broadcast_typing_indicator(
    room_id: UUID,
    req: Optional[TypingEventRequest] = None,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Transmite evento efêmero SSE 'typing' sem qualquer gravação no banco de dados.
    """
    is_typing = req.is_typing if req is not None else True

    await manager.broadcast_to_room(str(room_id), {
        "type": "typing",
        "room_id": str(room_id),
        "user_id": str(user.id),
        "nickname": user.nickname,
        "is_typing": is_typing,
        "expires_in": 3
    })

    return {
        "status": "ok",
        "is_typing": is_typing,
        "nickname": user.nickname
    }


class ExportHistoryRequest(BaseModel):
    password: str
    format: Optional[str] = "json"


@router.post("/rooms/{room_id}/export")
def export_room_history_endpoint(
    room_id: UUID,
    req: ExportHistoryRequest,
    auth_data: Tuple = Depends(require_chat_role("admin")),
    db: Session = Depends(get_db)
):
    """Exporta o histórico da sala protegido e criptografado por senha (restrito a Admin)."""
    room = db.query(Sala).filter(Sala.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada.")
    if room.is_secret_mode:
        raise HTTPException(status_code=403, detail="Exportação de histórico desativada para salas em Modo Secreto (Retenção Zero).")

    try:
        content_bytes, filename, media_type = export_room_history_encrypted(
            db=db,
            room_id=room_id,
            password=req.password,
            export_format=req.format or "json"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return Response(
        content=content_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )



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

    # 4. Verifica se o usuário foi bloqueado por algum membro da sala (RF06)
    outros_membros = db.query(MembroSala).filter(
        MembroSala.sala_id == room_id,
        MembroSala.usuario_id != user.id
    ).all()
    for om in outros_membros:
        bloqueio = db.query(BloqueioUsuario).filter(
            BloqueioUsuario.usuario_id == om.usuario_id,
            BloqueioUsuario.bloqueado_id == user.id
        ).first()
        if bloqueio:
            raise HTTPException(
                status_code=403,
                detail="Mensagem não entregue. Você foi bloqueado por um participante desta sala."
            )

    # 5. Define modo secreto herdado da sala ou da mensagem (RF03)
    room = db.query(Sala).filter(Sala.id == room_id).first()
    is_secret = bool(msg_in.is_secret_mode) or (room and bool(room.is_secret_mode))

    # 6. Cria e persiste a mensagem
    new_msg = Mensagem(
        sala_id=room_id,
        autor_id=user.id,
        autor_nickname=user.nickname,
        conteudo=msg_in.conteudo,
        reply_to_id=msg_in.reply_to_id,
        reacoes={},
        is_secret_mode=is_secret,
        ttl_seconds=msg_in.ttl_seconds,
        is_view_once=bool(msg_in.is_view_once),
        is_e2ee=bool(msg_in.is_e2ee),
        e2ee_envelope=msg_in.e2ee_envelope
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    # 7. Registra recibo 'sent' de envio (RF05)
    recibo_sent = ReciboMensagem(
        mensagem_id=new_msg.id,
        usuario_id=user.id,
        status="sent"
    )
    db.add(recibo_sent)
    db.commit()

    # 8. Broadcast em tempo real via SSE com metadados PRD
    msg_dict = {
        "type": "new_message",
        "id": str(new_msg.id),
        "sala_id": str(new_msg.sala_id),
        "autor_id": str(new_msg.autor_id),
        "autor_nickname": new_msg.autor_nickname,
        "conteudo": new_msg.conteudo,
        "created_at": new_msg.created_at.isoformat(),
        "reply_to_id": str(new_msg.reply_to_id) if new_msg.reply_to_id else None,
        "reacoes": new_msg.reacoes,
        "is_secret_mode": new_msg.is_secret_mode,
        "ttl_seconds": new_msg.ttl_seconds,
        "expires_at": new_msg.expires_at.isoformat() if new_msg.expires_at else None,
        "is_view_once": new_msg.is_view_once,
        "is_e2ee": new_msg.is_e2ee,
        "e2ee_envelope": new_msg.e2ee_envelope,
        "status_recibo": "sent"
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

    queue = await manager.connect(str(sala_id), user_id=str(user_uuid))

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
    """
    Denúncia de abuso com tratamento diferenciado (RF06):
    - Sala Permanente: anexa snapshot contextual das 5 mensagens anteriores.
    - Sala Efêmera / Modo Secreto: retenção zero de histórico; aplica bloqueio preventivo mútuo.
    """
    sala = db.query(Sala).filter(Sala.id == req.sala_id).first()
    if not sala:
        raise HTTPException(status_code=404, detail="Sala não encontrada.")

    alvo_msg = db.query(Mensagem).filter(Mensagem.id == req.mensagem_id).first()
    if not alvo_msg:
        raise HTTPException(status_code=404, detail="Mensagem denunciada não encontrada.")

    snapshot = []
    is_ephemeral = (sala.tipo_sala == "temporaria") or sala.is_secret_mode or alvo_msg.is_secret_mode

    if is_ephemeral:
        # Chats efêmeros: Retenção zero de histórico. Aplica bloqueio preventivo automático (RF06)
        if alvo_msg.autor_id and alvo_msg.autor_id != user.id:
            ja_bloqueado = db.query(BloqueioUsuario).filter(
                BloqueioUsuario.usuario_id == user.id,
                BloqueioUsuario.bloqueado_id == alvo_msg.autor_id
            ).first()
            if not ja_bloqueado:
                bloqueio_prev = BloqueioUsuario(usuario_id=user.id, bloqueado_id=alvo_msg.autor_id)
                db.add(bloqueio_prev)
        report_msg = "Denúncia registrada com bloqueio preventivo (chat efêmero com retenção zero de histórico)."
    else:
        # Chats permanentes: captura snapshot das últimas 5 mensagens
        msgs = (
            db.query(Mensagem)
            .filter(Mensagem.sala_id == req.sala_id, Mensagem.created_at <= alvo_msg.created_at)
            .order_by(Mensagem.created_at.desc())
            .limit(5)
            .all()
        )
        snapshot = [
            {
                "id": str(m.id),
                "autor_nickname": m.autor_nickname,
                "conteudo": m.conteudo,
                "created_at": m.created_at.isoformat()
            }
            for m in reversed(msgs)
        ]
        report_msg = "Denúncia registrada com snapshot contextual de auditoria (5 mensagens)."

    report = Denuncia(
        denunciante_id=user.id,
        mensagem_id=req.mensagem_id,
        sala_id=req.sala_id,
        motivo=req.motivo.strip(),
        snapshot_mensagens=snapshot
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {"message": report_msg, "id": str(report.id), "is_ephemeral": is_ephemeral}


# --- RF06: BLOQUEIO E DESBLOQUEIO DE USUÁRIOS ---

@router.post("/users/{user_id}/block")
def block_user(
    user_id: UUID,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bloqueia um usuário, impedindo envio de mensagens e interação (RF06)."""
    if user.id == user_id:
        raise HTTPException(status_code=400, detail="Não é possível bloquear a si mesmo.")

    alvo = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not alvo:
        raise HTTPException(status_code=404, detail="Usuário a ser bloqueado não encontrado.")

    existente = db.query(BloqueioUsuario).filter(
        BloqueioUsuario.usuario_id == user.id,
        BloqueioUsuario.bloqueado_id == user_id
    ).first()

    if not existente:
        bloqueio = BloqueioUsuario(usuario_id=user.id, bloqueado_id=user_id)
        db.add(bloqueio)
        db.commit()

    return {"message": f"Usuário {alvo.nickname} foi bloqueado com sucesso.", "bloqueado_id": str(user_id)}


@router.delete("/users/{user_id}/block")
def unblock_user(
    user_id: UUID,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Desbloqueia um usuário (RF06)."""
    db.query(BloqueioUsuario).filter(
        BloqueioUsuario.usuario_id == user.id,
        BloqueioUsuario.bloqueado_id == user_id
    ).delete()
    db.commit()
    return {"message": "Usuário desbloqueado com sucesso."}


@router.get("/users/blocked", response_model=List[BlockedUserOut])
def list_blocked_users(
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lista todos os usuários bloqueados pelo usuário atual (RF06)."""
    bloqueios = db.query(BloqueioUsuario).filter(BloqueioUsuario.usuario_id == user.id).all()
    results = []
    for b in bloqueios:
        alvo = db.query(Usuario).filter(Usuario.id == b.bloqueado_id).first()
        results.append(BlockedUserOut(
            id=b.id,
            bloqueado_id=b.bloqueado_id,
            nickname=alvo.nickname if alvo else "Usuário Removido",
            created_at=b.created_at
        ))
    return results


# --- RF05 & RF04: CONFIRMAÇÃO DE LEITURA E TEMPORIZADOR TTL ---

@router.post("/messages/{message_id}/read")
async def mark_message_as_read(
    message_id: UUID,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Marca a mensagem como lida (RF05).
    Se a mensagem possuir TTL, o status 'Lido' serve como gatilho imediato
    para o início da contagem regressiva de autodestruição (RF04).
    """
    msg = db.query(Mensagem).filter(Mensagem.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")

    # Registra o recibo 'read'
    recibo = db.query(ReciboMensagem).filter(
        ReciboMensagem.mensagem_id == message_id,
        ReciboMensagem.usuario_id == user.id,
        ReciboMensagem.status == "read"
    ).first()

    if not recibo:
        recibo = ReciboMensagem(
            mensagem_id=message_id,
            usuario_id=user.id,
            status="read"
        )
        db.add(recibo)

    # Gatilho de Autodestruição (RF04): leitura inicia a contagem do TTL
    ttl_triggered = False
    if msg.ttl_seconds and not msg.expires_at and msg.autor_id != user.id:
        msg.expires_at = datetime.now(timezone.utc) + timedelta(seconds=msg.ttl_seconds)
        ttl_triggered = True

    db.commit()

    # Transmite evento SSE de confirmação de leitura (ticks esmeralda ✓✓)
    event_data = {
        "type": "message_read",
        "message_id": str(msg.id),
        "reader_id": str(user.id),
        "reader_nickname": user.nickname,
        "sala_id": str(msg.sala_id)
    }
    await manager.broadcast_to_room(str(msg.sala_id), event_data)

    if ttl_triggered:
        await manager.broadcast_to_room(str(msg.sala_id), {
            "type": "ttl_started",
            "message_id": str(msg.id),
            "sala_id": str(msg.sala_id),
            "ttl_seconds": msg.ttl_seconds,
            "expires_at": msg.expires_at.isoformat()
        })

    return {
        "status": "read",
        "message_id": str(msg.id),
        "ttl_triggered": ttl_triggered,
        "expires_at": msg.expires_at.isoformat() if msg.expires_at else None
    }


@router.post("/messages/{message_id}/delivered")
async def mark_message_as_delivered(
    message_id: UUID,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Marca mensagem como entregue ao cliente (RF05 - Ticks ✓✓ cinza)."""
    msg = db.query(Mensagem).filter(Mensagem.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")

    recibo = db.query(ReciboMensagem).filter(
        ReciboMensagem.mensagem_id == message_id,
        ReciboMensagem.usuario_id == user.id,
        ReciboMensagem.status == "delivered"
    ).first()

    if not recibo:
        recibo = ReciboMensagem(
            mensagem_id=message_id,
            usuario_id=user.id,
            status="delivered"
        )
        db.add(recibo)
        db.commit()

    await manager.broadcast_to_room(str(msg.sala_id), {
        "type": "message_delivered",
        "message_id": str(msg.id),
        "recipient_id": str(user.id),
        "sala_id": str(msg.sala_id)
    })

    return {"status": "delivered", "message_id": str(msg.id)}


# --- RF07: MÍDIA DE VISUALIZAÇÃO ÚNICA (VIEW-ONCE) ---

@router.post("/messages/{message_id}/view-once/open")
def open_view_once_media(
    message_id: UUID,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Abre mídia de visualização única (rejeita se já tiver sido aberta anteriormente) (RF07)."""
    msg = db.query(Mensagem).filter(Mensagem.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")

    if not msg.is_view_once:
        raise HTTPException(status_code=400, detail="Esta mensagem não é de visualização única.")

    if msg.view_opened_at is not None:
        raise HTTPException(
            status_code=403,
            detail="Esta mídia era de visualização única e já foi visualizada/destruída."
        )

    # Marca abertura da mídia
    msg.view_opened_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "message_id": str(msg.id),
        "conteudo": msg.conteudo,
        "can_view": True,
        "is_view_once": True
    }


@router.post("/messages/{message_id}/view-once/close")
async def close_and_destroy_view_once(
    message_id: UUID,
    user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Ao fechar o visualizador, a mídia é imediatamente excluída no Cloudflare R2
    e a linha é purgada do banco de dados (Retenção Zero / RF07 / RN03).
    """
    msg = db.query(Mensagem).filter(Mensagem.id == message_id).first()
    if not msg:
        return {"message": "Mídia já excluída."}

    if not msg.is_view_once:
        raise HTTPException(status_code=400, detail="Esta mensagem não é de visualização única.")

    sala_id = str(msg.sala_id)
    msg_id = str(msg.id)

    # Exclui fisicamente a imagem do Cloudflare R2
    cleanup_message_media(msg.conteudo)

    # Exclui registro do banco
    db.delete(msg)
    db.commit()

    # Emite evento de destruição em tempo real para todos os clientes
    await manager.broadcast_to_room(sala_id, {
        "type": "message_destroyed",
        "message_id": msg_id,
        "sala_id": sala_id
    })

    return {"message": "Mídia de visualização única destruída com retenção zero."}