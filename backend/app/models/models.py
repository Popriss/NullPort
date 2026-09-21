from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean, Integer, UniqueConstraint, func
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime, timezone
from app.core.database import Base
from sqlalchemy.dialects.postgresql import UUID, JSONB


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nickname = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    senha_hash = Column(String(255), nullable=False)
    is_site_admin = Column(Boolean, default=False, nullable=False)
    is_muted_global = Column(Boolean, default=False, nullable=False)
    is_guest = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    # Relacionamentos
    salas_criadas = relationship("Sala", back_populates="criador", foreign_keys="[Sala.created_by]")
    membros = relationship("MembroSala", back_populates="usuario", cascade="all, delete-orphan")
    mensagens = relationship("Mensagem", back_populates="autor", foreign_keys="[Mensagem.autor_id]")
    denuncias = relationship("Denuncia", back_populates="denunciante", foreign_keys="[Denuncia.denunciante_id]")


class Sala(Base):
    __tablename__ = "salas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome_url = Column(String(100), unique=True, index=True, nullable=False)
    titulo = Column(String(150), nullable=False, default="")
    hash_senha = Column(String(255), nullable=True)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("salas.id", ondelete="CASCADE"), nullable=True)
    tipo_sala = Column(String(20), default="permanente", nullable=False)
    is_permanente = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    max_membros = Column(Integer, default=50, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    # Relacionamentos
    criador = relationship("Usuario", back_populates="salas_criadas", foreign_keys=[created_by])
    parent = relationship("Sala", remote_side=[id], backref="sub_salas")
    membros = relationship("MembroSala", back_populates="sala", cascade="all, delete-orphan")
    mensagens = relationship("Mensagem", back_populates="sala", cascade="all, delete-orphan")
    denuncias = relationship("Denuncia", back_populates="sala", cascade="all, delete-orphan")

    @property
    def tem_senha(self) -> bool:
        return bool(self.hash_senha)


class MembroSala(Base):
    __tablename__ = "membros_sala"
    __table_args__ = (
        UniqueConstraint("sala_id", "usuario_id", name="unique_membro"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sala_id = Column(UUID(as_uuid=True), ForeignKey("salas.id", ondelete="CASCADE"), nullable=False)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), default="padrao", nullable=False)  # 'admin', 'mod', 'padrao', 'view'
    is_muted = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    # Relacionamentos
    sala = relationship("Sala", back_populates="membros")
    usuario = relationship("Usuario", back_populates="membros")


class Mensagem(Base):
    __tablename__ = "mensagens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sala_id = Column(UUID(as_uuid=True), ForeignKey("salas.id", ondelete="CASCADE"), nullable=False)
    autor_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    autor_nickname = Column(String(50), nullable=False)
    conteudo = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())
    
    reply_to_id = Column(UUID(as_uuid=True), ForeignKey("mensagens.id", ondelete="SET NULL"), nullable=True)
    reacoes = Column(JSONB, server_default='{}', nullable=False)

    # Relacionamentos
    sala = relationship("Sala", back_populates="mensagens")
    autor = relationship("Usuario", back_populates="mensagens", foreign_keys=[autor_id])


class Denuncia(Base):
    __tablename__ = "denuncias"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    denunciante_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    mensagem_id = Column(UUID(as_uuid=True), ForeignKey("mensagens.id", ondelete="CASCADE"), nullable=False)
    sala_id = Column(UUID(as_uuid=True), ForeignKey("salas.id", ondelete="CASCADE"), nullable=False)
    motivo = Column(Text, nullable=False)
    status = Column(String(20), default="pendente", nullable=False)  # 'pendente', 'analisada', 'resolvida'
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    # Relacionamentos
    denunciante = relationship("Usuario", back_populates="denuncias", foreign_keys=[denunciante_id])
    mensagem = relationship("Mensagem", foreign_keys=[mensagem_id])
    sala = relationship("Sala", back_populates="denuncias", foreign_keys=[sala_id])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sala_id = Column(UUID(as_uuid=True), ForeignKey("salas.id", ondelete="SET NULL"), nullable=True)
    usuario_id = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    actor_nickname = Column(String(50), nullable=True)
    action = Column(String(50), nullable=False)  # 'role_change', 'mute_member', 'unmute_member', 'ban_member', 'create_room', 'delete_room', 'create_subroom'
    target_id = Column(String(100), nullable=True)
    target_nickname = Column(String(50), nullable=True)
    detalhes = Column(JSONB, server_default='{}', nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    # Relacionamentos
    sala = relationship("Sala", foreign_keys=[sala_id])
    usuario = relationship("Usuario", foreign_keys=[usuario_id])


class RoomWebhook(Base):
    __tablename__ = "room_webhooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sala_id = Column(UUID(as_uuid=True), ForeignKey("salas.id", ondelete="CASCADE"), nullable=False)
    nome = Column(String(100), default="Webhook Externo", nullable=False)
    token = Column(String(128), unique=True, index=True, nullable=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    # Relacionamentos
    sala = relationship("Sala", foreign_keys=[sala_id])
    criador = relationship("Usuario", foreign_keys=[created_by])