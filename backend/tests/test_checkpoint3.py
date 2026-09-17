import uuid
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.models import Usuario, Sala, MembroSala
from app.services.purge import purge_expired_temporary_rooms

client = TestClient(app)

def create_test_user(nickname: str, email: str, is_admin: bool = False):
    res = client.post("/api/auth/register", json={
        "nickname": nickname,
        "email": email,
        "senha": "SecurePassword123!",
        "is_site_admin": is_admin
    })
    assert res.status_code in [200, 201], f"Erro ao criar {nickname}: {res.text}"
    data = res.json()
    return data["access_token"], data["user"]

def run_checkpoint3_validation():
    print("=== INICIANDO VALIDAÇÃO DO CHECKPOINT 3 ===")

    suffix = uuid.uuid4().hex[:6]
    db = SessionLocal()

    # 1. Criação de usuários para cada nível de cargo
    print("\n1. Cadastrando usuários para cada cargo do RBAC...")
    token_admin, user_admin = create_test_user(f"u_admin_{suffix}", f"admin_{suffix}@test.com")
    token_mod, user_mod = create_test_user(f"u_mod_{suffix}", f"mod_{suffix}@test.com")
    token_padrao, user_padrao = create_test_user(f"u_padrao_{suffix}", f"padrao_{suffix}@test.com")
    token_view, user_view = create_test_user(f"u_view_{suffix}", f"view_{suffix}@test.com")

    # 2. Criar uma sala e atribuir os membros
    print("\n2. Configurando sala e membros com papéis: admin, mod, padrao, view...")
    room_url = f"rbac-room-{suffix}"
    res_room = client.post(
        "/api/chat/rooms",
        headers={"Authorization": f"Bearer {token_admin}"},
        json={"nome_url": room_url, "titulo": "Sala RBAC Test", "tipo_sala": "temporaria"}
    )
    assert res_room.status_code == 201, f"Erro ao criar sala: {res_room.text}"
    room_id = res_room.json()["id"]

    # Adiciona os outros membros no banco com os respectivos papéis
    db.add(MembroSala(sala_id=uuid.UUID(room_id), usuario_id=uuid.UUID(user_mod["id"]), role="mod"))
    db.add(MembroSala(sala_id=uuid.UUID(room_id), usuario_id=uuid.UUID(user_padrao["id"]), role="padrao"))
    db.add(MembroSala(sala_id=uuid.UUID(room_id), usuario_id=uuid.UUID(user_view["id"]), role="view"))
    db.commit()
    print("✅ Sala e membros configurados.")

    # 3. Teste de Permissões: Endpoint que exige cargo 'admin' (/subrooms)
    print("\n3. Testando endpoint restrito a 'admin' (/subrooms)...")
    subroom_payload = {"nome_url": f"sub-{suffix}", "titulo": "Sub Canal"}

    # View tentando criar sub-sala -> 403
    res_v = client.post(f"/api/chat/rooms/{room_id}/subrooms", headers={"Authorization": f"Bearer {token_view}"}, json=subroom_payload)
    assert res_v.status_code == 403, f"Esperava 403 para view, obteve {res_v.status_code}"
    print("   ✅ Usuário 'view' recebeu 403 Forbidden.")

    # Padrao tentando criar sub-sala -> 403
    res_p = client.post(f"/api/chat/rooms/{room_id}/subrooms", headers={"Authorization": f"Bearer {token_padrao}"}, json=subroom_payload)
    assert res_p.status_code == 403, f"Esperava 403 para padrao, obteve {res_p.status_code}"
    print("   ✅ Usuário 'padrao' recebeu 403 Forbidden.")

    # Mod tentando criar sub-sala -> 403
    res_m = client.post(f"/api/chat/rooms/{room_id}/subrooms", headers={"Authorization": f"Bearer {token_mod}"}, json=subroom_payload)
    assert res_m.status_code == 403, f"Esperava 403 para mod, obteve {res_m.status_code}"
    print("   ✅ Usuário 'mod' recebeu 403 Forbidden.")

    # Admin criando sub-sala -> 201 Created
    res_a = client.post(f"/api/chat/rooms/{room_id}/subrooms", headers={"Authorization": f"Bearer {token_admin}"}, json=subroom_payload)
    assert res_a.status_code == 201, f"Esperava 201 para admin, obteve {res_a.status_code}: {res_a.text}"
    print("   ✅ Usuário 'admin' criou sub-sala com 201 Created.")

    # 4. Teste de Permissões: Endpoint que exige cargo 'mod' (/mute)
    print("\n4. Testando endpoint restrito a 'mod' (/mute)...")
    # Padrao tentando mutar outro usuário -> 403
    res_mute_p = client.post(
        f"/api/chat/rooms/{room_id}/members/{user_view['id']}/mute",
        headers={"Authorization": f"Bearer {token_padrao}"},
        json={"is_muted": True}
    )
    assert res_mute_p.status_code == 403, f"Esperava 403 para padrao mutando, obteve {res_mute_p.status_code}"
    print("   ✅ Usuário 'padrao' recebeu 403 Forbidden ao tentar mutar membro.")

    # Mod mutando usuário -> 200 OK
    res_mute_m = client.post(
        f"/api/chat/rooms/{room_id}/members/{user_view['id']}/mute",
        headers={"Authorization": f"Bearer {token_mod}"},
        json={"is_muted": True}
    )
    assert res_mute_m.status_code == 200, f"Esperava 200 para mod mutando, obteve {res_mute_m.status_code}"
    print("   ✅ Usuário 'mod' mutou membro com 200 OK.")

    # 5. Teste de Permissões: Envio de mensagem (view vs padrao)
    print("\n5. Testando envio de mensagem (view vs padrao)...")
    res_msg_v = client.post(
        f"/api/chat/rooms/{room_id}/messages",
        headers={"Authorization": f"Bearer {token_view}"},
        json={"conteudo": "Tentando falar como view"}
    )
    assert res_msg_v.status_code == 403, f"Esperava 403 para view enviando mensagem, obteve {res_msg_v.status_code}"
    print("   ✅ Usuário 'view' bloqueado com 403 Forbidden.")

    res_msg_p = client.post(
        f"/api/chat/rooms/{room_id}/messages",
        headers={"Authorization": f"Bearer {token_padrao}"},
        json={"conteudo": "Olá, sou usuário padrao!"}
    )
    assert res_msg_p.status_code == 200, f"Esperava 200 para padrao enviando mensagem, obteve {res_msg_p.status_code}"
    print("   ✅ Usuário 'padrao' enviou mensagem com 200 OK.")

    # 6. Teste da Rotina de Purga de Salas Temporárias Expiradas
    print("\n6. Testando rotina de purga de salas temporárias com TTL expirado...")
    temp_url = f"purge-test-{suffix}"
    past_expiration = datetime.now(timezone.utc) - timedelta(minutes=1)
    
    # Insere sala temporária já expirada
    expired_room = Sala(
        nome_url=temp_url,
        titulo="Sala Expirada Test",
        tipo_sala="temporaria",
        is_permanente=False,
        expires_at=past_expiration
    )
    db.add(expired_room)
    db.commit()
    db.refresh(expired_room)
    expired_id = expired_room.id
    print(f"   Sala temporária expirada criada no banco: id={expired_id}")

    # Executa a purga
    purged_count = purge_expired_temporary_rooms(db)
    print(f"   Purga executada: {purged_count} sala(s) removida(s).")
    assert purged_count >= 1, "Nenhuma sala foi removida pela rotina de purga!"

    # Verifica se a sala foi realmente deletada do banco
    check_room = db.query(Sala).filter(Sala.id == expired_id).first()
    assert check_room is None, "A sala expirada ainda consta no banco de dados!"
    print("   ✅ Sala temporária expirada excluída com sucesso do banco de dados.")

    db.close()
    print("\n🎉 CHECKPOINT 3 VALIDADO COM SUCESSO ABSOLUTO! 🎉")

if __name__ == "__main__":
    run_checkpoint3_validation()
