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
        
    return url

SQLALCHEMY_DATABASE_URL = clean_database_url(os.getenv("DATABASE_URL"))

# Inicialização segura do engine com fallback para SQLite se a URL for inválida
try:
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
    else:
        engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
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
