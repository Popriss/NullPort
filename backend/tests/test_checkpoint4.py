import uuid
import io
import asyncio
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.core.database import SessionLocal
from app.models.models import Usuario, Sala, MembroSala
from app.services.sse import manager

client = TestClient(app)

def create_user(nickname: str, email: str):
    res = client.post("/api/auth/register", json={
        "nickname": nickname,
        "email": email,
        "senha": "TestPassword123!"
    })
    data = res.json()
    return data["access_token"], data["user"]

def run_checkpoint4_validation():
    print("=== INICIANDO VALIDAÇÃO DO CHECKPOINT 4 ===")

    suffix = uuid.uuid4().hex[:6]
    db = SessionLocal()

    # 1. Criação de dois usuários para teste de chat e SSE
    print("\n1. Criando dois usuários (Alice e Bob)...")
    token_alice, user_alice = create_user(f"alice_{suffix}", f"alice_{suffix}@test.com")
    token_bob, user_bob = create_user(f"bob_{suffix}", f"bob_{suffix}@test.com")

    # Cria sala
    res_room = client.post(
        "/api/chat/rooms",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"nome_url": f"chat-sse-{suffix}", "titulo": "Sala SSE Test"}
    )
    assert res_room.status_code == 201, f"Falha ao criar sala: {res_room.text}"
    room_id = res_room.json()["id"]

    # Bob entra na sala
    res_join = client.post(
        f"/api/chat/rooms/{room_id}/join",
        headers={"Authorization": f"Bearer {token_bob}"}
    )
    assert res_join.status_code == 200, f"Falha ao Bob entrar na sala: {res_join.text}"
    print(f"✅ Alice (Admin) e Bob (Padrão) ingressaram na sala {room_id}.")

    # 2. Teste SSE: Conexão e transmissão instantânea
    print("\n2. Testando broadcast instantâneo SSE...")
    async def test_sse_broadcast():
        # Conecta a fila do Bob no manager SSE
        bob_queue = await manager.connect(room_id)
        try:
            # Alice envia mensagem via API
            msg_content = f"Mensagem em tempo real de Alice {suffix}"
            res_msg = client.post(
                f"/api/chat/rooms/{room_id}/messages",
                headers={"Authorization": f"Bearer {token_alice}"},
                json={"conteudo": msg_content}
            )
            assert res_msg.status_code == 200, f"Falha no envio de Alice: {res_msg.text}"

            # Bob recebe no SSE imediatamente
            event_raw = await asyncio.wait_for(bob_queue.get(), timeout=3.0)
            import json
            event = json.loads(event_raw) if isinstance(event_raw, str) else event_raw
            assert event["type"] == "new_message", f"Tipo inesperado: {event}"
            assert event["conteudo"] == msg_content, f"Conteúdo incorreto: {event}"
            assert event["autor_nickname"] == user_alice["nickname"]
            print(f"   ✅ Evento SSE recebido instantaneamente por Bob: '{event['conteudo']}'")
        finally:
            manager.disconnect(room_id, bob_queue)

    asyncio.run(test_sse_broadcast())

    # 3. Teste de Mute: Alice muta Bob e valida que nova tentativa retorna 403
    print("\n3. Testando Mute de usuário e bloqueio de mensagens (403)...")
    res_mute = client.post(
        f"/api/chat/rooms/{room_id}/members/{user_bob['id']}/mute",
        headers={"Authorization": f"Bearer {token_alice}"},
        json={"is_muted": True}
    )
    assert res_mute.status_code == 200, f"Falha ao mutar Bob: {res_mute.text}"
    print("   Bob foi mutado pela Alice.")

    # Bob tenta enviar mensagem enquanto mutado -> Deve retornar 403 Forbidden
    res_blocked_msg = client.post(
        f"/api/chat/rooms/{room_id}/messages",
        headers={"Authorization": f"Bearer {token_bob}"},
        json={"conteudo": "Socorro, estou mutado!"}
    )
    assert res_blocked_msg.status_code == 403, f"Esperava 403 Forbidden para Bob mutado, obteve {res_blocked_msg.status_code}"
    print(f"   ✅ Envio bloqueado com status 403 Forbidden: {res_blocked_msg.json()['detail']}")

    # 4. Teste de Upload: Arquivo executável mascarado com extensão .png
    print("\n4. Testando validação por Magic Bytes (extensão .png mascarada com binário executável)...")
    # Header característico de arquivo Windows PE (.exe)
    disguised_exe_bytes = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00\xb8\x00\x00\x00"
    
    files = {
        "file": ("malicious_payload.png", disguised_exe_bytes, "image/png")
    }
    res_upload_fake = client.post(
        "/api/chat/upload",
        headers={"Authorization": f"Bearer {token_alice}"},
        files=files
    )
    assert res_upload_fake.status_code == 400, f"Esperava 400 Bad Request para magic bytes falsos, obteve {res_upload_fake.status_code}: {res_upload_fake.text}"
    error_detail = res_upload_fake.json().get("detail", "")
    assert "Magic Byte" in error_detail or "rejeitado" in error_detail.lower(), f"Mensagem não menciona Magic Byte: {error_detail}"
    print(f"   ✅ Upload de .exe disfarçado rejeitado com 400 Bad Request: {error_detail}")

    # Teste de Upload de imagem legítima (JPEG real)
    print("\n5. Testando upload de imagem real e sanitização EXIF...")
    valid_img = Image.new("RGB", (64, 64), color="blue")
    img_io = io.BytesIO()
    valid_img.save(img_io, format="JPEG")
    valid_bytes = img_io.getvalue()

    from app.services.storage import validate_and_sanitize_image
    sanitized, mime, ext = validate_and_sanitize_image(valid_bytes, "foto.jpg")
    assert mime == "image/jpeg"
    assert ext == "jpg"
    assert len(sanitized) > 0
    print("   ✅ Imagem real validada por Magic Bytes e sanitizada com sucesso.")

    db.close()
    print("\n🎉 CHECKPOINT 4 VALIDADO COM SUCESSO ABSOLUTO! 🎉")

if __name__ == "__main__":
    run_checkpoint4_validation()
