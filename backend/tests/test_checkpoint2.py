import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.models import Usuario

client = TestClient(app)

def run_checkpoint2_validation():
    print("=== INICIANDO VALIDAÇÃO DO CHECKPOINT 2 ===")

    suffix = uuid.uuid4().hex[:6]
    user_nickname = f"user_{suffix}"
    user_email = f"user_{suffix}@nullport.test"
    user_password = "UserSecurePass123!"

    admin_nickname = f"admin_{suffix}"
    admin_email = f"admin_{suffix}@nullport.test"
    admin_password = "AdminSecurePass123!"

    # 1. Registrar usuário padrão
    print("\n1. Testando registro de usuário padrão...")
    res1 = client.post("/api/auth/register", json={
        "nickname": user_nickname,
        "email": user_email,
        "senha": user_password,
        "is_site_admin": False
    })
    assert res1.status_code == 201, f"Falha ao registrar usuário padrão: {res1.text}"
    user_data = res1.json()
    assert user_data["user"]["is_site_admin"] is False
    assert "access_token" in user_data
    print(f"✅ Usuário padrão registrado com sucesso: {user_nickname}")

    # 2. Registrar usuário admin (is_site_admin = True)
    print("\n2. Testando registro de usuário administrador...")
    res2 = client.post("/api/auth/register", json={
        "nickname": admin_nickname,
        "email": admin_email,
        "senha": admin_password,
        "is_site_admin": True
    })
    assert res2.status_code == 201, f"Falha ao registrar admin: {res2.text}"
    admin_data = res2.json()
    assert admin_data["user"]["is_site_admin"] is True
    assert "access_token" in admin_data
    print(f"✅ Usuário admin registrado com sucesso: {admin_nickname}")

    # 3. Realizar login e obter token JWT
    print("\n3. Testando login do usuário padrão...")
    res_login = client.post("/api/auth/login", json={
        "login": user_email,
        "senha": user_password
    })
    assert res_login.status_code == 200, f"Falha no login: {res_login.text}"
    login_data = res_login.json()
    token = login_data["access_token"]
    assert token, "Token JWT não retornado no login"
    print("✅ Login realizado com sucesso e token JWT recebido.")

    # 4. Validar rota protegida /api/auth/me
    print("\n4. Testando rota protegida /api/auth/me com token JWT...")
    res_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_me.status_code == 200, f"Falha no /api/auth/me: {res_me.text}"
    me_data = res_me.json()
    assert me_data["nickname"] == user_nickname
    assert me_data["email"] == user_email
    print(f"✅ /api/auth/me validado com sucesso para {me_data['nickname']}")

    # 5. Validar Security Headers na resposta
    print("\n5. Validando Security Headers...")
    assert res_me.headers.get("x-content-type-options") == "nosniff"
    assert res_me.headers.get("x-frame-options") == "DENY"
    assert "Strict-Transport-Security" in res_me.headers or "strict-transport-security" in res_me.headers
    print("✅ Headers defensivos validados (nosniff, DENY, HSTS, CSP).")

    # 6. Testar Rate Limiting: 5 tentativas consecutivas com senha errada
    print("\n6. Testando Rate Limiting (5 tentativas com senha errada devem bloquear com 429)...")
    attacker_email = f"target_{suffix}@test.com"
    # Faz 5 tentativas falhas
    for i in range(1, 6):
        res_fail = client.post("/api/auth/login", json={
            "login": attacker_email,
            "senha": "WrongPassword!"
        })
        assert res_fail.status_code == 401, f"Esperado 401 na tentativa {i}, recebeu {res_fail.status_code}"
        print(f"   Tentativa {i}/5 com senha errada: 401 Unauthorized registrado.")

    # 6ª tentativa deve ser bloqueada pelo Rate Limiter (429 Too Many Requests)
    res_blocked = client.post("/api/auth/login", json={
        "login": attacker_email,
        "senha": "AnyPassword"
    })
    assert res_blocked.status_code == 429, f"Esperado 429 Too Many Requests, recebeu {res_blocked.status_code}: {res_blocked.text}"
    print(f"✅ 6ª tentativa bloqueada por Rate Limit com status 429: {res_blocked.json()['detail']}")

    print("\n🎉 CHECKPOINT 2 VALIDADO COM SUCESSO ABSOLUTO! 🎉")

if __name__ == "__main__":
    run_checkpoint2_validation()
