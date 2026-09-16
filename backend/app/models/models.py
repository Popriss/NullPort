from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Uuid, func
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from app.core.database import Base
from sqlalchemy.dialects.postgresql import UUID, JSONB

class Sala(Base):
    __tablename__ = "salas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome_url = Column(String, unique=True, index=True, nullable=False)
    hash_senha = Column(String, nullable=False) # 👈 Alinhado com o banco (hash_senha)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    mensagens = relationship("Mensagem", back_populates="sala", cascade="all, delete-orphan")


class Mensagem(Base):
    __tablename__ = "mensagens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sala_id = Column(UUID(as_uuid=True), ForeignKey("salas.id", ondelete="CASCADE"), nullable=False)
    autor_nickname = Column(String, nullable=False)
    conteudo = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    reply_to_id = Column(UUID(as_uuid=True), ForeignKey("mensagens.id", ondelete="SET NULL"), nullable=True)
    reacoes = Column(JSONB, server_default='{}', nullable=False)

    sala = relationship("Sala", back_populates="mensagens")