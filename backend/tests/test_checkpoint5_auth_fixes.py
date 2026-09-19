import uuid
from fastapi.testclient import TestClient

from app.main import app
from app.services.auth import decode_access_token

client = TestClient(app)

def create_user(nickname: str, email: str, senha: str = "TestPassword123!"):
    res = client.post("/api/auth/register", json={
        "nickname": nickname,
        "email": email,
        "senha": senha
    })
    assert res.status_code == 201, f"Falha ao registrar usuário: {res.text}"
    data = res.json()
    return data["access_token"], data["user"]

def login_user(email: str, senha: str = "TestPassword123!"):
    res = client.post("/api/auth/login", json={
        "email": email,
        "senha": senha
    })
    assert res.status_code == 200, f"Falha ao logar usuário: {res.text}"
    return res.json()["access_token"]


def test_my_rooms():
    """
    Checkpoint 1: Persistência pós Logout/Relogin.
    Valida que o usuário recupera todas as suas salas na chamada GET /api/chat/my-rooms
    mesmo após obter novo token (relogin), e não vê salas alheias onde não é membro.
    """
    suffix = uuid.uuid4().hex[:6]

    # 1. Cria Charlie e Dave
    token_charlie, user_charlie = create_user(f"charlie_{suffix}", f"charlie_{suffix}@test.com")
    token_dave, user_dave = create_user(f"dave_{suffix}", f"dave_{suffix}@test.com")

    # 2. Charlie cria Sala A
    res_room_a = client.post(
        "/api/chat/rooms",
        headers={"Authorization": f"Bearer {token_charlie}"},
        json={"nome_url": f"sala-a-{suffix}", "titulo": "Sala A"}
    )
    assert res_room_a.status_code == 201, f"Falha ao criar Sala A: {res_room_a.text}"
    room_a_id = res_room_a.json()["id"]

    # 3. Dave cria Sala B
    res_room_b = client.post(
        "/api/chat/rooms",
        headers={"Authorization": f"Bearer {token_dave}"},
        json={"nome_url": f"sala-b-{suffix}", "titulo": "Sala B"}
    )
    assert res_room_b.status_code == 201, f"Falha ao criar Sala B: {res_room_b.text}"
    room_b_id = res_room_b.json()["id"]

    # 4. Dave ingressa na Sala A de Charlie
    res_join = client.post(
        f"/api/chat/rooms/{room_a_id}/join",
        headers={"Authorization": f"Bearer {token_dave}"}
    )
    assert res_join.status_code == 200, f"Falha ao Dave entrar na Sala A: {res_join.text}"

    # 5. Simula Logout e Relogin de Charlie
    fresh_token_charlie = login_user(f"charlie_{suffix}@test.com")

    # 6. Charlie chama /my-rooms com o novo token
    res_my_rooms_charlie = client.get(
        "/api/chat/my-rooms",
        headers={"Authorization": f"Bearer {fresh_token_charlie}"}
    )
    assert res_my_rooms_charlie.status_code == 200, f"Falha ao buscar my-rooms de Charlie: {res_my_rooms_charlie.text}"
    charlie_rooms = res_my_rooms_charlie.json()
    charlie_room_ids = [r["id"] for r in charlie_rooms]

    # Critério de Aceite: Charlie recupera Sala A e NÃO vê Sala B
    assert room_a_id in charlie_room_ids, "Sala A não retornou nas salas de Charlie pós-relogin"
    assert room_b_id not in charlie_room_ids, "Sala B de Dave não deveria constar para Charlie"

    # 7. Simula Logout e Relogin de Dave
    fresh_token_dave = login_user(f"dave_{suffix}@test.com")

    # 8. Dave chama /my-rooms com novo token -> Deve ver Sala B (sua) e Sala A (onde ingressou)
    res_my_rooms_dave = client.get(
        "/api/chat/my-rooms",
        headers={"Authorization": f"Bearer {fresh_token_dave}"}
    )
    assert res_my_rooms_dave.status_code == 200
    dave_rooms = res_my_rooms_dave.json()
    dave_room_ids = [r["id"] for r in dave_rooms]

    assert room_a_id in dave_room_ids, "Dave deveria ter Sala A em my-rooms após ingressar"
    assert room_b_id in dave_room_ids, "Dave deveria ter Sala B em my-rooms pois é o criador"
    print("✅ Checkpoint 1 (test_my_rooms) validado com sucesso!")


def test_guest_message():
    """
    Checkpoint 2: Zero-Login & Envio de Mensagem.
    Valida que um visitante sem conta acessa sala efêmera, recebe token JWT
    com 'user_id' e 'sub', e envia mensagem sem receber erro HTTP 401 ou 403.
    """
    suffix = uuid.uuid4().hex[:6]
    room_url = f"efemera-{suffix}"
    guest_nick = f"Guest_{suffix}"

    # 1. Acesso Zero-Login via POST /api/auth/room
    res_auth = client.post("/api/auth/room", json={
        "nome_url": room_url,
        "nickname": guest_nick,
        "senha": "password123"
    })
    assert res_auth.status_code == 200, f"Falha no acesso direto à sala efêmera: {res_auth.text}"
    auth_data = res_auth.json()

    assert "access_token" in auth_data, "access_token ausente na resposta"
    token = auth_data["access_token"]
    assert "user_id" in auth_data, "user_id ausente na resposta"
    room_id = auth_data.get("sala_id")
    assert room_id is not None, "sala_id ausente na resposta"

    # 2. Valida o payload do token JWT decodificado
    payload = decode_access_token(token)
    assert payload is not None, "Falha ao decodificar token do visitante"
    assert "sub" in payload, "Campo 'sub' ausente no JWT do visitante"
    assert "user_id" in payload, "Campo 'user_id' ausente no JWT do visitante"
    assert payload["user_id"] == auth_data["user_id"]
    assert payload["sub"] == auth_data["user_id"]

    # 3. Visitante envia mensagem na sala via POST /api/chat/rooms/{room_id}/messages
    msg_content = f"Mensagem enviada por visitante efêmero {suffix}"
    res_msg = client.post(
        f"/api/chat/rooms/{room_id}/messages",
        headers={"Authorization": f"Bearer {token}"},
        json={"conteudo": msg_content}
    )
    # Critério de Aceite: Não pode retornar 401 Unauthorized nem 403 Forbidden
    assert res_msg.status_code == 200, f"Erro ao enviar mensagem como convidado: {res_msg.status_code} - {res_msg.text}"
    msg_data = res_msg.json()
    assert msg_data["conteudo"] == msg_content
    assert msg_data["autor_nickname"] == guest_nick

    # 4. Valida recuperação das mensagens na sala pelo visitante
    res_get_msgs = client.get(
        f"/api/chat/rooms/{room_id}/messages",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res_get_msgs.status_code == 200, f"Erro ao obter mensagens como convidado: {res_get_msgs.text}"
    messages = res_get_msgs.json()
    assert any(m["conteudo"] == msg_content for m in messages), "Mensagem do visitante não encontrada no histórico"

    # 5. Também valida compatibilidade legada POST /api/chat/messages
    msg_legacy_content = f"Mensagem legada visitante {suffix}"
    res_legacy = client.post(
        "/api/chat/messages",
        headers={"Authorization": f"Bearer {token}"},
        json={"conteudo": msg_legacy_content}
    )
    assert res_legacy.status_code == 200, f"Erro ao enviar mensagem legada: {res_legacy.status_code} - {res_legacy.text}"
    assert res_legacy.json()["conteudo"] == msg_legacy_content

    print("✅ Checkpoint 2 (test_guest_message) validado com sucesso!")


if __name__ == "__main__":
    test_my_rooms()
    test_guest_message()
    print("\nTodos os testes de Checkpoint 5 passaram com sucesso!")
