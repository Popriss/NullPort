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

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# Se não houver DATABASE_URL definido ou se estiver vazio, usa SQLite local temporariamente
if not SQLALCHEMY_DATABASE_URL or SQLALCHEMY_DATABASE_URL.strip() == "":
    SQLALCHEMY_DATABASE_URL = "sqlite:///./nullport.db"

if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
