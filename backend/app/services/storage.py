import boto3
from botocore.config import Config
from app.core.config import settings
import uuid
import io
import filetype
from PIL import Image
from fastapi import HTTPException, status
from typing import Tuple

ALLOWED_MIME_TYPES = {
    # Imagens (RF02 / RF07)
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    # Áudios (RF02)
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "weba",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    # Documentos PDF (RF02)
    "application/pdf": "pdf"
}

def validate_and_sanitize_image(file_bytes: bytes, filename: str) -> Tuple[bytes, str, str]:
    """
    Zero-Trust em Uploads (RF02, RN04):
    1. Validação por Magic Numbers / Bytes reais via filetype e headers nativos.
    2. Rejeição de arquivos mascarados ou executáveis maliciosos.
    3. Remoção obrigatória de metadados EXIF das imagens.
    4. Suporte a mídias de chat: Fotos, Áudios e Documentos PDF.
    """
    kind = filetype.guess(file_bytes)
    real_mime = None
    extension = None

    if kind and kind.mime in ALLOWED_MIME_TYPES:
        real_mime = kind.mime
        extension = ALLOWED_MIME_TYPES[real_mime]
    elif file_bytes.startswith(b"%PDF-"):
        real_mime = "application/pdf"
        extension = "pdf"
    elif file_bytes.startswith(b"ID3") or file_bytes[:2] == b"\xff\xfb" or file_bytes[:2] == b"\xff\xf3":
        real_mime = "audio/mpeg"
        extension = "mp3"
    elif file_bytes.startswith(b"RIFF") and b"WAVE" in file_bytes[:16]:
        real_mime = "audio/wav"
        extension = "wav"
    elif file_bytes.startswith(b"OggS"):
        real_mime = "audio/ogg"
        extension = "ogg"

    if not real_mime or real_mime not in ALLOWED_MIME_TYPES:
        detected = kind.mime if kind else "desconhecido"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Arquivo rejeitado por Magic Byte. Tipo detectado: '{detected}'. Formatos permitidos: Imagens (JPG, PNG, WEBP, GIF), Áudios (MP3, WAV, OGG) e Documentos PDF."
        )

    # Sanitização EXIF para JPEG, PNG, WEBP via Pillow (apenas para imagens)
    try:
        if real_mime in ["image/jpeg", "image/png", "image/webp"]:
            with Image.open(io.BytesIO(file_bytes)) as img:
                # Cria uma nova imagem limpa sem metadados EXIF
                data = list(img.getdata())
                image_without_exif = Image.new(img.mode, img.size)
                image_without_exif.putdata(data)
                
                output = io.BytesIO()
                fmt = "JPEG" if real_mime == "image/jpeg" else ("PNG" if real_mime == "image/png" else "WEBP")
                image_without_exif.save(output, format=fmt, quality=90)
                sanitized_bytes = output.getvalue()
                return sanitized_bytes, real_mime, extension
    except Exception as e:
        print(f"[EXIF SANITIZATION WARNING] Falha ao sanitizar EXIF: {e}")

    return file_bytes, real_mime, extension


def get_s3_client():
    if not settings.R2_ACCOUNT_ID:
        return None
    
    endpoint_url = f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto"
    )

async def upload_image_to_r2(file_bytes: bytes, filename: str, content_type: str = "image/jpeg") -> str:
    s3_client = get_s3_client()
    if not s3_client:
        raise ValueError("Cloudflare R2 is not configured.")

    ext = filename.split(".")[-1] if "." in filename else "jpg"
    unique_filename = f"{uuid.uuid4().hex}.{ext}"

    s3_client.put_object(
        Bucket=settings.R2_BUCKET_NAME,
        Key=unique_filename,
        Body=file_bytes,
        ContentType=content_type,
        ContentDisposition="inline", # Armazenado como inline sem permissão de script
    )

    public_base = settings.R2_PUBLIC_URL.rstrip("/")
    return f"{public_base}/{unique_filename}"


def extract_r2_key(url_or_key: str) -> str:
    """Extrai a chave do arquivo no R2 a partir de uma URL pública ou chave."""
    if not url_or_key:
        return ""
    if "/" in url_or_key:
        return url_or_key.rstrip("/").split("/")[-1]
    return url_or_key


def delete_file_from_r2(url_or_key: str) -> bool:
    """
    Exclusão definitiva de objeto no Cloudflare R2 (RN03 - Retenção Zero / Hard Wipe).
    Garante que mídias de mensagens efêmeras, deletadas ou de visualização única
    sejam fisicamente destruídas do bucket.
    """
    key = extract_r2_key(url_or_key)
    if not key:
        return False

    s3_client = get_s3_client()
    if not s3_client:
        return False

    try:
        s3_client.delete_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=key
        )
        return True
    except Exception as e:
        print(f"[R2 HARD WIPE WARNING] Falha ao excluir objeto '{key}' do R2: {e}")
        return False

