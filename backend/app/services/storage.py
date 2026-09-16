import boto3
from botocore.config import Config
from app.core.config import settings
import uuid

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
    )

    public_base = settings.R2_PUBLIC_URL.rstrip("/")
    return f"{public_base}/{unique_filename}"
