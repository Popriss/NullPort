-- Migração 003: NullPort PRD - Recursos Avançados (RF01-RF07, RN01-RN07)

-- 1. Bloqueio de Usuários (RF06)
CREATE TABLE IF NOT EXISTS bloqueios_usuario (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    bloqueado_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_usuario_bloqueado UNIQUE (usuario_id, bloqueado_id)
);

CREATE INDEX IF NOT EXISTS idx_bloqueios_usuario_id ON bloqueios_usuario(usuario_id);
CREATE INDEX IF NOT EXISTS idx_bloqueios_bloqueado_id ON bloqueios_usuario(bloqueado_id);

-- 2. Modo Secreto em Salas e Mensagens (RF03)
ALTER TABLE salas ADD COLUMN IF NOT EXISTS is_secret_mode BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS is_secret_mode BOOLEAN DEFAULT FALSE NOT NULL;

-- 3. Temporizador TTL, View-Once e E2EE em Mensagens (RF04, RF07, RN01)
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS ttl_seconds INTEGER NULL;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE NULL;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS is_view_once BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS view_opened_at TIMESTAMP WITH TIME ZONE NULL;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS is_e2ee BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS e2ee_envelope JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_mensagens_expires_at ON mensagens(expires_at) WHERE expires_at IS NOT NULL;

-- 4. Snapshot de 5 mensagens em Denúncias (RF06)
ALTER TABLE denuncias ADD COLUMN IF NOT EXISTS snapshot_mensagens JSONB DEFAULT '[]'::jsonb NOT NULL;

-- 5. Confirmação de Leitura e Recibos (RF05)
CREATE TABLE IF NOT EXISTS recibos_mensagem (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mensagem_id UUID NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'read'
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_recibo_status UNIQUE (mensagem_id, usuario_id, status)
);

CREATE INDEX IF NOT EXISTS idx_recibos_mensagem_id ON recibos_mensagem(mensagem_id);
CREATE INDEX IF NOT EXISTS idx_recibos_usuario_id ON recibos_mensagem(usuario_id);

-- 6. Autenticação SMS OTP e Gestão Multidispositivo (RF01)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(30) UNIQUE NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS public_key_e2ee TEXT NULL;

CREATE TABLE IF NOT EXISTS codigos_otp (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telefone VARCHAR(30) NOT NULL,
    codigo_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    tentativas INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codigos_otp_telefone ON codigos_otp(telefone);

CREATE TABLE IF NOT EXISTS sessoes_ativas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    device_name VARCHAR(100) NOT NULL DEFAULT 'Navegador Web',
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    token_jti VARCHAR(64) UNIQUE NOT NULL,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessoes_usuario_id ON sessoes_ativas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_token_jti ON sessoes_ativas(token_jti);
