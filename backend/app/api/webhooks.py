import secrets
from typing import Optional, List, Dict, Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rbac import require_chat_role, get_current_user
from app.models.models import Sala, Mensagem, RoomWebhook, Usuario, AuditLog
from app.services.sse import manager

router = APIRouter(prefix="/chat/rooms", tags=["webhooks"])

class WebhookCreateRequest(BaseModel):
    nome: Optional[str] = "Integração Externa"

class WebhookOut(BaseModel):
    id: UUID
    sala_id: UUID
    nome: str
    token: str
    webhook_url: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


def _format_github_payload(payload: Dict[str, Any]) -> Optional[str]:
    """Formata payloads de webhooks do GitHub (Push, PR, Ping) em Markdown."""
    # Ping event
    if "zen" in payload and "hook_id" in payload:
        return f"### 🐙 GitHub Webhook Conectado!\n> _{payload.get('zen')}_\nO webhook foi configurado com sucesso para este repositório."

    # Pull Request event
    if "pull_request" in payload:
        pr = payload["pull_request"]
        action = payload.get("action", "atualizado")
        repo = payload.get("repository", {}).get("full_name", "Repositório")
        sender = payload.get("sender", {}).get("login", "autor")
        return (
            f"### 🐙 GitHub Pull Request [{action}]\n"
            f"**Repositório:** `{repo}`\n"
            f"**PR #{pr.get('number')}:** [{pr.get('title')}]({pr.get('html_url')})\n"
            f"**Autor:** @{sender}\n"
            f"**Status:** {pr.get('state', '').upper()}"
        )

    # Push / Commits event
    if "commits" in payload or "pusher" in payload:
        repo = payload.get("repository", {}).get("full_name", "Repositório")
        pusher = payload.get("pusher", {}).get("name", "dev")
        branch = payload.get("ref", "").replace("refs/heads/", "")
        commits = payload.get("commits", [])
        
        md_lines = [
            f"### 🐙 GitHub Push para `{branch}` em `{repo}`",
            f"**Autor:** @{pusher}",
            f"**Total de Commits:** {len(commits)}",
            ""
        ]
        for c in commits[:5]:
            msg = c.get("message", "").split("\n")[0]
            cid = c.get("id", "")[:7]
            md_lines.append(f"- [`{cid}`]({c.get('url', '#')}) {msg}")
        
        if len(commits) > 5:
            md_lines.append(f"_...e mais {len(commits) - 5} commit(s)_")
        return "\n".join(md_lines)

    return None


def _format_uptimerobot_payload(payload: Dict[str, Any]) -> Optional[str]:
    """Formata payloads de alerta do UptimeRobot em Markdown."""
    keys = {k.lower(): v for k, v in payload.items()}
    if "monitorfriendlyname" in keys or "alerttypefriendlyname" in keys or "monitorurl" in keys:
        name = keys.get("monitorfriendlyname", "Serviço")
        url = keys.get("monitorurl", "")
        status_alert = keys.get("alerttypefriendlyname", "Alerta").upper()
        details = keys.get("alertdetails", "Sem detalhes adicionais")
        icon = "🔴" if "DOWN" in status_alert else ("🟢" if "UP" in status_alert else "⚠️")

        return (
            f"### {icon} UptimeRobot Alerta: `{name}`\n"
            f"**Status:** **{status_alert}**\n"
            f"**URL:** {url}\n"
            f"**Detalhes:** {details}"
        )
    return None


def _format_generic_payload(payload: Dict[str, Any]) -> str:
    """Formatação limpa e legível para qualquer payload JSON arbitrário."""
    # Se contém campos comuns de notificação
    title = payload.get("title") or payload.get("event") or payload.get("action") or "Notificação Externa"
    message = payload.get("message") or payload.get("text") or payload.get("conteudo") or payload.get("msg")

    lines = [f"### 🤖 Webhook: {title}"]
    if message:
        lines.append(f"> {message}\n")

    # Adiciona campos chave se forem simples
    details = []
    for k, v in payload.items():
        if k not in ["title", "event", "action", "message", "text", "conteudo", "msg"]:
            if isinstance(v, (str, int, float, bool)):
                details.append(f"- **{k}:** {v}")
    if details:
        lines.append("**Propriedades:**")
        lines.extend(details[:8])

    return "\n".join(lines)


# --- ROTAS DE GESTÃO DE WEBHOOKS (ADMINS DA SALA) ---

@router.post("/{room_id}/webhooks/generate", response_model=WebhookOut)
@router.post("/{room_id}/webhooks", response_model=WebhookOut, status_code=status.HTTP_201_CREATED)
def create_room_webhook(
    room_id: UUID,
    req: Optional[WebhookCreateRequest] = None,
    auth_data: tuple = Depends(require_chat_role("admin")),
    db: Session = Depends(get_db)
):
    """Gera um novo Webhook Token para a sala (restrito a Admin do Chat ou Site Admin)."""
    user, _ = auth_data
    room = db.query(Sala).filter(Sala.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Sala não encontrada.")

    token = secrets.token_urlsafe(32)
    webhook = RoomWebhook(
        sala_id=room_id,
        nome=(req.nome.strip() if req and req.nome else "Webhook Externo"),
        token=token,
        created_by=user.id
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)

    return WebhookOut(
        id=webhook.id,
        sala_id=webhook.sala_id,
        nome=webhook.nome,
        token=webhook.token,
        webhook_url=f"/api/chat/rooms/{room_id}/webhooks?token={webhook.token}",
        created_at=webhook.created_at.isoformat()
    )


@router.get("/{room_id}/webhooks", response_model=List[WebhookOut])
def list_room_webhooks(
    room_id: UUID,
    auth_data: tuple = Depends(require_chat_role("admin")),
    db: Session = Depends(get_db)
):
    """Lista todos os webhooks cadastrados para a sala."""
    webhooks = db.query(RoomWebhook).filter(RoomWebhook.sala_id == room_id).order_by(RoomWebhook.created_at.desc()).all()
    return [
        WebhookOut(
            id=w.id,
            sala_id=w.sala_id,
            nome=w.nome,
            token=w.token,
            webhook_url=f"/api/chat/rooms/{room_id}/webhooks?token={w.token}",
            created_at=w.created_at.isoformat()
        )
        for w in webhooks
    ]


@router.delete("/{room_id}/webhooks/{webhook_id}")
def delete_room_webhook(
    room_id: UUID,
    webhook_id: UUID,
    auth_data: tuple = Depends(require_chat_role("admin")),
    db: Session = Depends(get_db)
):
    """Revoga e exclui um webhook de sala."""
    webhook = db.query(RoomWebhook).filter(
        RoomWebhook.id == webhook_id,
        RoomWebhook.sala_id == room_id
    ).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook não encontrado nesta sala.")

    db.delete(webhook)
    db.commit()
    return {"message": "Webhook revogado e removido com sucesso."}


# --- ROTA DE CONSUMO DE WEBHOOKS ENTRANTES (SERVIÇOS EXTERNOS) ---

@router.post("/{room_id}/webhooks")
async def receive_room_webhook(
    room_id: UUID,
    request: Request,
    token: str = Query(..., description="Token de autenticação do Webhook"),
    db: Session = Depends(get_db)
):
    """
    Consome alertas de serviços externos (GitHub, UptimeRobot, CI/CD).
    Formata o payload JSON em Markdown e publica a mensagem no chat em tempo real via SSE.
    """
    # 1. Valida existência da sala e autenticidade do token
    webhook = db.query(RoomWebhook).filter(
        RoomWebhook.sala_id == room_id,
        RoomWebhook.token == token
    ).first()

    if not webhook:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token de webhook inválido para esta sala.")

    # 2. Extrai payload JSON
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload deve ser um JSON válido.")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON deve ser um objeto/dicionário.")

    # 3. Detecta origem e formata para Markdown
    markdown_content = (
        _format_github_payload(payload) or
        _format_uptimerobot_payload(payload) or
        _format_generic_payload(payload)
    )

    bot_nickname = "Webhook"
    if "commits" in payload or "pull_request" in payload or "zen" in payload:
        bot_nickname = "GitHub"
    elif "monitorFriendlyName" in payload or "alertTypeFriendlyName" in payload:
        bot_nickname = "UptimeRobot"

    # 4. Salva a mensagem formatada no banco de dados da sala
    nova_msg = Mensagem(
        sala_id=room_id,
        autor_id=None,
        autor_nickname=bot_nickname,
        conteudo=markdown_content,
        reacoes={}
    )
    db.add(nova_msg)
    db.commit()
    db.refresh(nova_msg)

    # 5. Transmite evento instantaneamente via SSE (e Redis PubSub)
    msg_dict = {
        "id": str(nova_msg.id),
        "sala_id": str(nova_msg.sala_id),
        "autor_id": None,
        "autor_nickname": nova_msg.autor_nickname,
        "conteudo": nova_msg.conteudo,
        "created_at": nova_msg.created_at.isoformat(),
        "reply_to_id": None,
        "reacoes": {}
    }
    await manager.broadcast_to_room(str(room_id), msg_dict)

    return {
        "status": "received",
        "message_id": str(nova_msg.id),
        "formatted_content": markdown_content
    }
