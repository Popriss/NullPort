from fastapi import APIRouter, Depends, HTTPException, Header, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import asyncio
import os
import requests
from uuid import UUID

from app.core.database import get_db
from app.models.models import Sala, Mensagem
from app.schemas.chat import MessageCreate, MessageOut
from app.services.auth import decode_access_token
from app.services.sse import manager

router = APIRouter(prefix="/chat", tags=["chat"])

def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token de autorização ausente ou inválido.")
    token = authorization.split(" ")[1]
    payload = decode_access_token(token)
    if not payload or "sala_id" not in payload:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado.")
    return payload

@router.get("/messages", response_model=List[MessageOut])
def get_messages(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 500000
):
    sala_id = user["sala_id"]
    messages = (
        db.query(Mensagem)
        .filter(Mensagem.sala_id == UUID(sala_id))
        .order_by(Mensagem.created_at.asc())
        .limit(limit)
        .all()
    )
    return messages

@router.post("/messages", response_model=MessageOut)
async def send_message(
    msg_in: MessageCreate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sala_id = user["sala_id"]
    autor_nickname = user["nickname"]

    new_msg = Mensagem(
        sala_id=UUID(sala_id),
        autor_nickname=autor_nickname,
        conteudo=msg_in.conteudo
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    # Broadcast via SSE to room
    msg_dict = {
        "id": str(new_msg.id),
        "sala_id": str(new_msg.sala_id),
        "autor_nickname": new_msg.autor_nickname,
        "conteudo": new_msg.conteudo,
        "created_at": new_msg.created_at.isoformat()
    }
    await manager.broadcast_to_room(sala_id, msg_dict)

    return new_msg

@router.get("/stream")
async def chat_stream(request: Request, token: str):
    payload = decode_access_token(token)
    if not payload or "sala_id" not in payload:
        raise HTTPException(status_code=401, detail="Token inválido.")
    
    sala_id = payload["sala_id"]
    queue = await manager.connect(sala_id)

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    # Keep-alive heartbeat comment
                    yield ": keep-alive\n\n"
        finally:
            manager.disconnect(sala_id, queue)

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
    user: dict = Depends(get_current_user)
):
    # Validamos o formato
    if file.content_type not in ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]:
        raise HTTPException(status_code=400, detail="Formato de arquivo não suportado.")

    # Lemos o arquivo e validamos o tamanho (< 2MB)
    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Arquivo excede o limite de tamanho.")

    # Pegamos a chave do ImgBB no .env
    api_key = os.getenv("IMGBB_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="API Key do ImgBB não configurada")

    # Enviamos para o ImgBB via POST
    url_imgbb = "https://api.imgbb.com/1/upload"
    payload = {"key": api_key}
    files = {"image": (file.filename, contents, file.content_type)}
    
    response = requests.post(url_imgbb, data=payload, files=files)
    
    # Se der certo, devolvemos a URL pro frontend
    if response.status_code == 200:
        data = response.json()
        link_direto = data["data"]["url"]
        return {"url": link_direto}
    else:
        print("Erro ImgBB:", response.text)
        raise HTTPException(status_code=500, detail="Erro ao salvar a imagem no servidor externo.")