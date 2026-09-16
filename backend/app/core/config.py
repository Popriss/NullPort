import os
from pathlib import Path
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Carrega .env da pasta backend ou da raiz do projeto (sem sobrescrever se já definido)
current_dir = Path(__file__).resolve().parent
for env_path in [
    current_dir.parent.parent / ".env",          # backend/.env
    current_dir.parent.parent.parent / ".env",   # NullPort/.env (raiz)
]:
    if env_path.exists():
        load_dotenv(env_path, override=False)

class Settings(BaseSettings):
    PROJECT_NAME: str = "NullPort API"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./nullport.db").strip().strip('"\'')
    SECRET_KEY: str = os.getenv("SECRET_KEY", "modesto_chat_nullport_837498273948723_qualquer_coisa").strip().strip('"\'')
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256").strip().strip('"\'')
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    
    # Cloudflare R2 (opcional para testes)
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "nullport-images")
    R2_PUBLIC_URL: str = os.getenv("R2_PUBLIC_URL", "")

    class Config:
        case_sensitive = True

settings = Settings()
