import uuid
import json
import asyncio
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import SessionLocal
from app.models.models import Usuario, Sala, MembroSala, Mensagem, AuditLog, RoomWebhook
from app.api.chat import extract_mentions
from app.services.sse import ConnectionManager
from app.core.redis import InMemoryPubSubBroker
from app.services.export import decrypt_room_history

client = TestClient(app)

def create_user(nickname: str, email: str, senha: str = "SecurePassV3!", is_site_admin: bool = False):
    res = client.post("/api/auth/register", json={
        "nickname": nickname,
        "email": email,
        "senha": senha,
        "is_site_admin": is_site_admin
    })
    assert res.status_code in [200, 201], f"Falha ao registrar usuário {nickname}: {res.text}"
    data = res.json()
    return data["access_token"], data["user"]


def test_checkpoint1_typing_and_mentions():
    """
    Checkpoint 1 (Typing & Menções):
    - Testar envio do evento typing via POST /api/chat/rooms/{room_id}/typing.
    - Verificar ausência de registros na tabela 'mensagens'.
    - Validar parsing de '@nickname'.
    """
    print("\n=== Executando Checkpoint 1: Typing & Menções ===")
    suffix = uuid.uuid4().hex[:6]
    db = SessionLocal()

    token_user, user = create_user(f"alice_{suffix}", f"alice_{suffix}@test.com")

    # Cria sala para o teste
    res_room = client.post(
        "/api/chat/rooms",
        headers={"Authorization": f"Bearer {token_user}"},
        json={"nome_url": f"sala-typing-{suffix}", "titulo": "Sala Typing"}
    )
    assert res_room.status_code == 201
    room_id = res_room.json()["id"]

    # 1. Contagem de mensagens antes do evento typing
    count_before = db.query(Mensagem).filter(Mensagem.sala_id == uuid.UUID(room_id)).count()

    # 2. Dispara o evento de digitação efêmero
    res_typing = client.post(
        f"/api/chat/rooms/{room_id}/typing",
        headers={"Authorization": f"Bearer {token_user}"},
        json={"is_typing": True}
    )
    assert res_typing.status_code == 200, f"Falha no endpoint typing: {res_typing.text}"
    data_typing = res_typing.json()
    assert data_typing["status"] == "ok"
    assert data_typing["is_typing"] is True
    assert data_typing["nickname"] == user["nickname"]

    # 3. Critério de Aceite: Ausência de registros persistidos na tabela 'mensagens'
    count_after = db.query(Mensagem).filter(Mensagem.sala_id == uuid.UUID(room_id)).count()
    assert count_after == count_before, (
        f"Violação de arquitetura efêmera: {count_after - count_before} registro(s) gravado(s) na tabela mensagens!"
    )
    print("   ✅ Evento 'typing' processado com sucesso sem persistência na tabela mensagens.")

    # 4. Validar parsing e extração de '@nickname'
    sample_text = "Olá @carlos e @mariana_dev! Favor checar com @bob-ops e novamente @carlos."
    mentions = extract_mentions(sample_text)
    assert "carlos" in mentions, "Menção 'carlos' não detectada"
    assert "mariana_dev" in mentions, "Menção 'mariana_dev' não detectada"
    assert "bob-ops" in mentions, "Menção 'bob-ops' não detectada"
    assert len(mentions) == 3, f"Esperado 3 menções únicas, obteve {len(mentions)}: {mentions}"

    # Validação com texto sem menções
    no_mentions = extract_mentions("Mensagem de teste comum sem arrobas.")
    assert no_mentions == [], f"Deveria retornar lista vazia, retornou {no_mentions}"

    db.close()
    print("   ✅ Parsing de @nickname validado com sucesso.")
    print("✅ Checkpoint 1 (Typing & Menções) concluído com êxito!")


def test_checkpoint2_redis_pubsub():
    """
    Checkpoint 2 (Redis PubSub):
    - Simular duas instâncias da classe de SSE (ConnectionManager).
    - Garantir que a publicação em uma réplica é recebida pelo assinante na outra.
    """
    print("\n=== Executando Checkpoint 2: Redis PubSub entre Réplicas ===")
    room_id = f"room-pubsub-{uuid.uuid4().hex[:6]}"

    async def run_pubsub_simulation():
        # Broker de comunicação compartilhado entre as réplicas
        broker = InMemoryPubSubBroker()

        # Simula duas instâncias isoladas de backend (Réplica A e Réplica B)
        replica_a = ConnectionManager(broker=broker)
        replica_b = ConnectionManager(broker=broker)

        # Cliente SSE se conecta na Réplica A
        queue_client_a = await replica_a.connect(room_id, user_id="user_listener_1")

        try:
            # Réplica B publica evento na sala
            msg_broadcast = {
                "type": "new_message",
                "conteudo": "Mensagem distribuída via PubSub V3",
                "autor_nickname": "ReplicaB_Sender"
            }
            await replica_b.broadcast_to_room(room_id, msg_broadcast)

            # O assinante na Réplica A deve receber o evento
            raw_event = await asyncio.wait_for(queue_client_a.get(), timeout=2.5)
            event = json.loads(raw_event) if isinstance(raw_event, str) else raw_event

            assert event["type"] == "new_message"
            assert event["conteudo"] == "Mensagem distribuída via PubSub V3"
            assert event["autor_nickname"] == "ReplicaB_Sender"
            print(f"   ✅ Réplica A recebeu mensagem transmitida pela Réplica B: '{event['conteudo']}'")
        finally:
            replica_a.disconnect(room_id, queue_client_a)

    asyncio.run(run_pubsub_simulation())
    print("✅ Checkpoint 2 (Redis PubSub) concluído com êxito!")


def test_checkpoint3_webhooks():
    """
    Checkpoint 3 (Webhooks):
    - Enviar requisição POST com payload de teste para a URL do webhook.
    - Validar publicação da mensagem formatada na sala.
    """
    print("\n=== Executando Checkpoint 3: Webhooks Entrantes ===")
    suffix = uuid.uuid4().hex[:6]
    token_admin, user_admin = create_user(f"owner_{suffix}", f"owner_{suffix}@test.com")

    # 1. Cria sala
    res_room = client.post(
        "/api/chat/rooms",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"nome_url": f"sala-webhook-{suffix}", "titulo": "Sala Webhook Test"}
    )
    assert res_room.status_code == 201
    room_id = res_room.json()["id"]

    # 2. Gera Webhook Token para a sala
    res_wh = client.post(
        f"/api/chat/rooms/{room_id}/webhooks",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"nome": "GitHub CI / PR Bot"}
    )
    assert res_wh.status_code == 201, f"Falha ao gerar webhook: {res_wh.text}"
    wh_data = res_wh.json()
    token_webhook = wh_data["token"]
    assert token_webhook, "Token de webhook não retornado"

    # 3. Envia requisição externa com payload simulado do GitHub
    github_payload = {
        "repository": {"full_name": "NullPort/Infra"},
        "pusher": {"name": "pedro_dev"},
        "ref": "refs/heads/main",
        "commits": [
            {
                "id": "e319e3b999",
                "message": "feat(v3): implementar escalabilidade pubsub e webhooks",
                "url": "https://github.com/NullPort/Infra/commit/e319e3b999"
            }
        ]
    }

    res_post_hook = client.post(
        f"/api/chat/rooms/{room_id}/webhooks?token={token_webhook}",
        json=github_payload
    )
    assert res_post_hook.status_code == 200, f"Falha ao consumir webhook: {res_post_hook.text}"
    hook_result = res_post_hook.json()
    assert hook_result["status"] == "received"
    assert "GitHub Push" in hook_result["formatted_content"]

    # 4. Valida persistência da mensagem formatada no histórico da sala
    res_msgs = client.get(
        f"/api/chat/rooms/{room_id}/messages",
        headers={"Authorization": f"Bearer {token_admin}"}
    )
    assert res_msgs.status_code == 200
    mensagens = res_msgs.json()
    msg_webhook = next((m for m in mensagens if "GitHub Push" in m["conteudo"]), None)
    assert msg_webhook is not None, "Mensagem do Webhook não encontrada no histórico da sala!"
    assert msg_webhook["autor_nickname"] == "GitHub"
    assert "pedro_dev" in msg_webhook["conteudo"]
    assert "feat(v3)" in msg_webhook["conteudo"]

    print("   ✅ Payload externo GitHub recebido, formatado em Markdown e publicado na sala.")
    print("✅ Checkpoint 3 (Webhooks) concluído com êxito!")


def test_checkpoint4_audit_trail():
    """
    Checkpoint 4 (Audit Trail):
    - Executar alteração de cargo de um membro da sala.
    - Validar se um novo registro foi inserido na tabela 'audit_logs'.
    - Validar consulta pela rota GET /api/admin/audit-logs.
    """
    print("\n=== Executando Checkpoint 4: Audit Trail Imutável ===")
    suffix = uuid.uuid4().hex[:6]
    db = SessionLocal()

    token_admin, admin_user = create_user(f"admin_audit_{suffix}", f"admin_audit_{suffix}@test.com")
    token_member, normal_user = create_user(f"member_{suffix}", f"member_{suffix}@test.com")

    # 1. Cria sala e membro padrão ingressa
    res_room = client.post(
        "/api/chat/rooms",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"nome_url": f"sala-audit-{suffix}", "titulo": "Sala Auditoria"}
    )
    assert res_room.status_code == 201
    room_id = res_room.json()["id"]

    res_join = client.post(
        f"/api/chat/rooms/{room_id}/join",
        headers={"Authorization": f"Bearer {token_member}"}
    )
    assert res_join.status_code == 200

    # 2. Executa alteração de cargo de 'padrao' para 'mod'
    res_role = client.post(
        f"/api/chat/rooms/{room_id}/members/{normal_user['id']}/role",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"role": "mod"}
    )
    assert res_role.status_code == 200, f"Falha ao alterar cargo: {res_role.text}"
    assert res_role.json()["role"] == "mod"

    # 3. Valida se o registro imutável foi inserido na tabela audit_logs
    audit_entry = (
        db.query(AuditLog)
        .filter(
            AuditLog.sala_id == uuid.UUID(room_id),
            AuditLog.action == "role_change"
        )
        .order_by(AuditLog.created_at.desc())
        .first()
    )

    assert audit_entry is not None, "Nenhum registro de auditoria encontrado para a alteração de cargo!"
    assert audit_entry.target_id == str(normal_user["id"])
    assert audit_entry.actor_nickname == admin_user["nickname"]
    assert audit_entry.detalhes.get("old_role") == "padrao"
    assert audit_entry.detalhes.get("new_role") == "mod"
    print(f"   ✅ Registro imutável gravado em audit_logs: {audit_entry.action} por {audit_entry.actor_nickname}")

    # 4. Valida endpoint administrativo GET /api/admin/audit-logs
    res_get_logs = client.get(
        f"/api/admin/audit-logs?sala_id={room_id}",
        headers={"Authorization": f"Bearer {token_admin}"}
    )
    assert res_get_logs.status_code == 200, f"Falha na listagem de audit logs: {res_get_logs.text}"
    logs_data = res_get_logs.json()
    assert len(logs_data) >= 1
    matched = [l for l in logs_data if l["action"] == "role_change" and l["target_id"] == str(normal_user["id"])]
    assert len(matched) == 1
    assert matched[0]["detalhes"]["new_role"] == "mod"

    db.close()
    print("   ✅ Rota GET /api/admin/audit-logs validada com sucesso.")
    print("✅ Checkpoint 4 (Audit Trail) concluído com êxito!")


def test_checkpoint_encrypted_export():
    """
    Validação da funcionalidade de Exportação Criptografada (Task 3.2):
    - Exporta histórico protegido com senha.
    - Valida abertura com a senha correta e rejeição com senha incorreta.
    """
    print("\n=== Executando Teste: Exportação Criptografada ===")
    suffix = uuid.uuid4().hex[:6]
    token_admin, admin_user = create_user(f"exporter_{suffix}", f"exporter_{suffix}@test.com")

    res_room = client.post(
        "/api/chat/rooms",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"nome_url": f"sala-export-{suffix}", "titulo": "Sala Export"}
    )
    assert res_room.status_code == 201
    room_id = res_room.json()["id"]

    # Envia uma mensagem de teste
    client.post(
        f"/api/chat/rooms/{room_id}/messages",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"conteudo": "Dados confidenciais para auditoria V3"}
    )

    password = "ChaveSecretaNullPort2026!"

    # Exporta histórico
    res_exp = client.post(
        f"/api/chat/rooms/{room_id}/export",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"password": password, "format": "json"}
    )
    assert res_exp.status_code == 200
    encrypted_bytes = res_exp.content

    # Abertura com senha correta -> Sucesso
    decrypted_data = decrypt_room_history(encrypted_bytes, password)
    assert decrypted_data["version"] == "NullPort-V3"
    assert decrypted_data["total_messages"] >= 1
    assert any("Dados confidenciais" in m["conteudo"] for m in decrypted_data["mensagens"])
    print("   ✅ Histórico aberto e decifrado com sucesso mediante senha correta.")

    # Abertura com senha incorreta -> Deve falhar
    try:
        decrypt_room_history(encrypted_bytes, "SenhaIncorreta999!")
        assert False, "Deveria ter lançado exceção para senha incorreta!"
    except ValueError as e:
        assert "Senha incorreta" in str(e)
        print("   ✅ Abertura com senha incorreta bloqueada com sucesso.")

    print("✅ Teste de Exportação Criptografada concluído com êxito!")


if __name__ == "__main__":
    test_checkpoint1_typing_and_mentions()
    test_checkpoint2_redis_pubsub()
    test_checkpoint3_webhooks()
    test_checkpoint4_audit_trail()
    test_checkpoint_encrypted_export()
    print("\n🎉 TODOS OS CHECKPOINTS DA FASE V3 FORAM VALIDADOS COM SUCESSO ABSOLUTO! 🎉\n")
