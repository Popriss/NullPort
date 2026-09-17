-- Habilita extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Usuários (Global)
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nickname VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    is_site_admin BOOLEAN DEFAULT FALSE,
    is_muted_global BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela de Salas (Evolução / Criação)
CREATE TABLE IF NOT EXISTS salas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome_url VARCHAR(100) UNIQUE NOT NULL,
    titulo VARCHAR(150) NOT NULL DEFAULT '',
    hash_senha VARCHAR(255) NULL,
    parent_id UUID NULL REFERENCES salas(id) ON DELETE CASCADE,
    tipo_sala VARCHAR(20) DEFAULT 'permanente' CHECK (tipo_sala IN ('permanente', 'temporaria')),
    is_permanente BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE NULL,
    max_membros INT DEFAULT 50,
    created_by UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migração de colunas para salas já existentes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salas' AND column_name = 'titulo') THEN
        ALTER TABLE salas ADD COLUMN titulo VARCHAR(150) NOT NULL DEFAULT '';
        UPDATE salas SET titulo = nome_url WHERE titulo = '';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salas' AND column_name = 'parent_id') THEN
        ALTER TABLE salas ADD COLUMN parent_id UUID NULL REFERENCES salas(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salas' AND column_name = 'tipo_sala') THEN
        ALTER TABLE salas ADD COLUMN tipo_sala VARCHAR(20) DEFAULT 'permanente' CHECK (tipo_sala IN ('permanente', 'temporaria'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salas' AND column_name = 'is_permanente') THEN
        ALTER TABLE salas ADD COLUMN is_permanente BOOLEAN DEFAULT TRUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salas' AND column_name = 'expires_at') THEN
        ALTER TABLE salas ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salas' AND column_name = 'max_membros') THEN
        ALTER TABLE salas ADD COLUMN max_membros INT DEFAULT 50;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'salas' AND column_name = 'created_by') THEN
        ALTER TABLE salas ADD COLUMN created_by UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL;
    END IF;

    -- Permite hash_senha nulo para salas públicas
    ALTER TABLE salas ALTER COLUMN hash_senha DROP NOT NULL;
END $$;

-- Índice para busca de salas temporárias com expiração
CREATE INDEX IF NOT EXISTS idx_salas_temporarias_exp ON salas(expires_at) WHERE tipo_sala = 'temporaria';
CREATE INDEX IF NOT EXISTS idx_salas_nome_url ON salas(nome_url);
CREATE INDEX IF NOT EXISTS idx_salas_parent_id ON salas(parent_id);

-- 3. Tabela de Membros (RBAC Local)
CREATE TABLE IF NOT EXISTS membros_sala (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sala_id UUID NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'padrao' CHECK (role IN ('admin', 'mod', 'padrao', 'view')),
    is_muted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_membro UNIQUE (sala_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_membros_sala_id ON membros_sala(sala_id);
CREATE INDEX IF NOT EXISTS idx_membros_usuario_id ON membros_sala(usuario_id);

-- 4. Tabela de Mensagens (Evolução / Criação)
CREATE TABLE IF NOT EXISTS mensagens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sala_id UUID NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    autor_id UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
    autor_nickname VARCHAR(50) NOT NULL,
    conteudo TEXT NOT NULL,
    reply_to_id UUID NULL REFERENCES mensagens(id) ON DELETE SET NULL,
    reacoes JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Migração de colunas para mensagens existentes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'mensagens' AND column_name = 'autor_id') THEN
        ALTER TABLE mensagens ADD COLUMN autor_id UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mensagens_sala_id ON mensagens(sala_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_created_at ON mensagens(created_at DESC);

-- 5. Tabela de Denúncias
CREATE TABLE IF NOT EXISTS denuncias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    denunciante_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    mensagem_id UUID NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
    sala_id UUID NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
    motivo TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'analisada', 'resolvida')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_denuncias_sala_id ON denuncias(sala_id);
CREATE INDEX IF NOT EXISTS idx_denuncias_status ON denuncias(status);
