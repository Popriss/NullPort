import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Carrega .env da pasta backend ou da raiz do projeto (sem sobrescrever se já definido)
current_dir = Path(__file__).resolve().parent
for env_path in [
    current_dir.parent.parent / ".env",          # backend/.env
    current_dir.parent.parent.parent / ".env",   # NullPort/.env (raiz)
]:
    if env_path.exists():
        load_dotenv(env_path, override=False)

def clean_database_url(raw_url: str | None) -> str:
    if not raw_url:
        return "sqlite:///./nullport.db"
    
    url = raw_url.strip()
    
    # Remove prefixo se colaram a linha inteira "DATABASE_URL=..."
    if url.startswith("DATABASE_URL="):
        url = url[len("DATABASE_URL="):].strip()
        
    # Remove aspas externas simples ou duplas
    url = url.strip('"\'').strip()
    
    # Compatibilidade: converte postgres:// para postgresql:// exigido pelo SQLAlchemy
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]

    # Supabase exige conexão SSL obrigatória (sslmode=require)
    if url.startswith("postgresql://") and "sslmode" not in url:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}sslmode=require"

    return url

SQLALCHEMY_DATABASE_URL = clean_database_url(os.getenv("DATABASE_URL"))

# Inicialização segura do engine com fallback para SQLite se a URL for inválida
try:
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
    else:
        # Detecta se é Supabase Pooler em Transaction Mode (porta 6543)
        is_transaction_pooler = ":6543" in SQLALCHEMY_DATABASE_URL

        connect_args = {
            "connect_timeout": 10,
            "sslmode": "require"
        }

        if is_transaction_pooler:
            from sqlalchemy.pool import NullPool
            engine = create_engine(
                SQLALCHEMY_DATABASE_URL,
                poolclass=NullPool,       # Recomendado pelo Supabase/SQLAlchemy para PgBouncer Transaction Mode
                pool_pre_ping=True,
                connect_args=connect_args
            )
        else:
            engine = create_engine(
                SQLALCHEMY_DATABASE_URL,
                pool_pre_ping=True,       # Testa a conexão antes de usar; reconecta silenciosamente se estiver morta
                pool_recycle=60,          # Recicla conexões a cada 60s (evita que o pooler do Supabase feche conexões ociosas)
                pool_size=5,              # Pool conservador para não esgotar as conexões do plano gratuito do Supabase
                max_overflow=5,
                connect_args=connect_args
            )
except Exception as e:
    print(f"[AVISO BANCO DE DADOS] Falha ao conectar em '{SQLALCHEMY_DATABASE_URL}': {e}. Usando SQLite local.")
    engine = create_engine("sqlite:///./nullport.db", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
