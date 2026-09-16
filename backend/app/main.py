from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import api_router
from app.core.config import settings
from app.core.database import Base, engine

# Cria as tabelas se não existirem (caso utilize conexão direta com Supabase)
if engine:
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Aviso ao inicializar tabelas: {e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API do NullPort - Sistema de Chat Seguro com SSE",
    version="1.0.0"
)

# Configuração de CORS para permitir acesso do frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção pode ser restringido para o domínio do frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas da API
app.include_router(api_router, prefix="/api")

@app.get("/")
def root():
    return {"message": "NullPort API está rodando perfeitamente!", "status": "online"}
