from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Uuid
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.core.database import Base

class Sala(Base):
    __tablename__ = "salas"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    nome_url = Column(String, unique=True, index=True, nullable=False)
    hash_senha = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    mensagens = relationship("Mensagem", back_populates="sala", cascade="all, delete-orphan")

class Mensagem(Base):
    __tablename__ = "mensagens"

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    sala_id = Column(Uuid, ForeignKey("salas.id"), nullable=False)
    autor_nickname = Column(String, nullable=False)
    conteudo = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sala = relationship("Sala", back_populates="mensagens")
