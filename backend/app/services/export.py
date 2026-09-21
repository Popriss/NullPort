import os
import json
import base64
import hashlib
import hmac
from uuid import UUID
from datetime import datetime, timezone
from typing import Dict, Any, Tuple
from sqlalchemy.orm import Session

from app.models.models import Sala, Mensagem, MembroSala, Usuario

# Identificador de formato criptografado NullPort V3
HEADER_MAGIC = b"NULLPORT_ENC_V3\x00"
PBKDF2_ITERATIONS = 100_000

def _derive_keys(password: str, salt: bytes) -> Tuple[bytes, bytes]:
    """Deriva chave de cifra (32 bytes) e chave de autenticação HMAC (32 bytes) via PBKDF2."""
    derived = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt,
        iterations=PBKDF2_ITERATIONS,
        dklen=64
    )
    return derived[:32], derived[32:]


def _encrypt_payload(plaintext_bytes: bytes, password: str) -> bytes:
    """
    Criptografa o payload com chave derivada da senha do administrador.
    Utiliza AES-256 (via cryptography se disponível, ou CTR com HMAC-SHA256 verificado).
    """
    salt = os.urandom(16)
    iv = os.urandom(16)
    enc_key, hmac_key = _derive_keys(password, salt)

    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.backends import default_backend
        cipher = Cipher(algorithms.AES(enc_key), modes.CTR(iv), backend=default_backend())
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(plaintext_bytes) + encryptor.finalize()
    except ImportError:
        # Fallback de cifra em fluxo por bloco AES / Keystream HMAC se cryptography não estiver instalada
        keystream = b""
        block_counter = 0
        while len(keystream) < len(plaintext_bytes):
            block_counter += 1
            h = hmac.new(enc_key, iv + block_counter.to_bytes(4, 'big'), hashlib.sha256)
            keystream += h.digest()
        ciphertext = bytes([p ^ k for p, k in zip(plaintext_bytes, keystream[:len(plaintext_bytes)])])

    # Tag de autenticação HMAC-SHA256 (Encrypt-then-MAC)
    mac = hmac.new(hmac_key, HEADER_MAGIC + salt + iv + ciphertext, hashlib.sha256).digest()
    return HEADER_MAGIC + salt + iv + mac + ciphertext


def _decrypt_payload(encrypted_data: bytes, password: str) -> bytes:
    """Decifra e valida integridade do histórico com a senha informada."""
    if not encrypted_data.startswith(HEADER_MAGIC):
        # Tenta verificar se é um JSON envelope em base64
        try:
            parsed = json.loads(encrypted_data.decode("utf-8"))
            if parsed.get("format") == "nullport_v3_encrypted":
                encrypted_data = base64.b64decode(parsed["payload"])
        except Exception:
            raise ValueError("Formato de arquivo criptografado inválido.")

    if not encrypted_data.startswith(HEADER_MAGIC):
        raise ValueError("Cabeçalho de criptografia NullPort V3 não encontrado.")

    header_len = len(HEADER_MAGIC)
    salt = encrypted_data[header_len : header_len + 16]
    iv = encrypted_data[header_len + 16 : header_len + 32]
    mac = encrypted_data[header_len + 32 : header_len + 64]
    ciphertext = encrypted_data[header_len + 64 :]

    enc_key, hmac_key = _derive_keys(password, salt)

    # Validação do MAC (rejeita imediatamente senha incorreta ou adulteração)
    expected_mac = hmac.new(hmac_key, HEADER_MAGIC + salt + iv + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(mac, expected_mac):
        raise ValueError("Senha incorreta ou integridade do arquivo violada.")

    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.backends import default_backend
        cipher = Cipher(algorithms.AES(enc_key), modes.CTR(iv), backend=default_backend())
        decryptor = cipher.decryptor()
        return decryptor.update(ciphertext) + decryptor.finalize()
    except ImportError:
        keystream = b""
        block_counter = 0
        while len(keystream) < len(ciphertext):
            block_counter += 1
            h = hmac.new(enc_key, iv + block_counter.to_bytes(4, 'big'), hashlib.sha256)
            keystream += h.digest()
        return bytes([c ^ k for c, k in zip(ciphertext, keystream[:len(ciphertext)])])


def build_room_history_data(db: Session, room_id: UUID) -> Dict[str, Any]:
    """Coleta o histórico completo de mensagens, membros e metadados da sala."""
    sala = db.query(Sala).filter(Sala.id == room_id).first()
    if not sala:
        raise ValueError("Sala não encontrada.")

    mensagens = (
        db.query(Mensagem)
        .filter(Mensagem.sala_id == room_id)
        .order_by(Mensagem.created_at.asc())
        .all()
    )

    membros = (
        db.query(MembroSala, Usuario)
        .join(Usuario, MembroSala.usuario_id == Usuario.id)
        .filter(MembroSala.sala_id == room_id)
        .all()
    )

    history = {
        "version": "NullPort-V3",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "sala": {
            "id": str(sala.id),
            "nome_url": sala.nome_url,
            "titulo": sala.titulo,
            "tipo_sala": sala.tipo_sala,
            "created_at": sala.created_at.isoformat() if sala.created_at else None,
        },
        "total_messages": len(mensagens),
        "membros": [
            {
                "nickname": u.nickname,
                "role": m.role,
                "created_at": m.created_at.isoformat() if m.created_at else None
            }
            for m, u in membros
        ],
        "mensagens": [
            {
                "id": str(msg.id),
                "autor_nickname": msg.autor_nickname,
                "conteudo": msg.conteudo,
                "reacoes": msg.reacoes or {},
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "reply_to_id": str(msg.reply_to_id) if msg.reply_to_id else None
            }
            for msg in mensagens
        ]
    }
    return history


def export_room_history_encrypted(
    db: Session,
    room_id: UUID,
    password: str,
    export_format: str = "json"
) -> Tuple[bytes, str, str]:
    """
    Gera o histórico da sala criptografado com a senha fornecida.
    Retorna: (conteúdo_binário, nome_do_arquivo, tipo_mime).
    """
    if not password or len(password) < 4:
        raise ValueError("A senha para exportação criptografada deve ter no mínimo 4 caracteres.")

    data = build_room_history_data(db, room_id)
    room_slug = data["sala"]["nome_url"]

    if export_format.lower() == "pdf":
        # Formata histórico como documento de texto estruturado para PDF / audit transcript
        lines = [
            f"=== NULLPORT CHAT AUDIT TRANSCRIPT (V3) ===",
            f"SALA: #{data['sala']['nome_url']} ({data['sala']['titulo']})",
            f"EXPORTADO EM: {data['exported_at']}",
            f"TOTAL DE MENSAGENS: {data['total_messages']}",
            "=" * 60,
            ""
        ]
        for msg in data["mensagens"]:
            lines.append(f"[{msg['created_at']}] <{msg['autor_nickname']}>: {msg['conteudo']}")
        plain_bytes = "\n".join(lines).encode("utf-8")
        filename = f"nullport_transcript_{room_slug}.pdf.enc"
        media_type = "application/octet-stream"
    else:
        # JSON estruturado
        plain_bytes = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
        filename = f"nullport_history_{room_slug}.json.enc"
        media_type = "application/json"

    encrypted_bytes = _encrypt_payload(plain_bytes, password)

    # Cria envelope JSON para facilitar transporte e download
    envelope = {
        "format": "nullport_v3_encrypted",
        "room": room_slug,
        "export_format": export_format.lower(),
        "exported_at": data["exported_at"],
        "payload": base64.b64encode(encrypted_bytes).decode("ascii")
    }
    return json.dumps(envelope, indent=2).encode("utf-8"), filename, media_type


def decrypt_room_history(encrypted_file_content: bytes, password: str) -> Dict[str, Any]:
    """Função utilitária para validar e decifrar arquivos exportados mediante senha correta."""
    decrypted_bytes = _decrypt_payload(encrypted_file_content, password)
    try:
        return json.loads(decrypted_bytes.decode("utf-8"))
    except Exception:
        return {"raw_transcript": decrypted_bytes.decode("utf-8", errors="replace")}
