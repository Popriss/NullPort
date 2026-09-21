-- Migração V3: NullPort - Governança Enterprise & Integrações Externas

-- 1. Tabela de Logs de Auditoria (Audit Trail Imutável)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sala_id UUID NULL REFERENCES salas(id) ON DELETE SET NULL,
    usuario_id UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
    actor_nickname VARCHAR(50) NULL,
    action VARCHAR(50) NOT NULL, -- 'role_change', 'mute_member', 'unmute_member', 'ban_member', 'create_room', 'delete_room', 'create_subroom'
    target_id VARCHAR(100) NULL,
    target_nickname VARCHAR(50) NULL,
    detalhes JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_sala_id ON audit_logs(sala_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario_id ON audit_logs(usuario_id);

-- 2. Tabela de Webhooks de Entrada para Salas
CREATE TABLE IF NOT EXISTS room_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sala_id UUID NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL DEFAULT 'Webhook Externo',
    token VARCHAR(128) UNIQUE NOT NULL,
    created_by UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_webhooks_sala_id ON room_webhooks(sala_id);
CREATE INDEX IF NOT EXISTS idx_room_webhooks_token ON room_webhooks(token);
