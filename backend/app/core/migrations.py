import logging
from sqlalchemy import text, inspect

logger = logging.getLogger("nullport.migrations")

POSTGRES_MIGRATIONS = [
    # Extensão UUID
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',

    # 1. Usuários (RF01, RN01, V2)
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefone VARCHAR(30) UNIQUE NULL;",
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS public_key_e2ee TEXT NULL;",
    "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT FALSE NOT NULL;",

    # 2. Salas (RF03, V2)
    "ALTER TABLE salas ADD COLUMN IF NOT EXISTS is_secret_mode BOOLEAN DEFAULT FALSE NOT NULL;",
    "ALTER TABLE salas ADD COLUMN IF NOT EXISTS tipo_sala VARCHAR(20) DEFAULT 'permanente';",
    "ALTER TABLE salas ADD COLUMN IF NOT EXISTS is_permanente BOOLEAN DEFAULT TRUE;",
    "ALTER TABLE salas ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE NULL;",
    "ALTER TABLE salas ADD COLUMN IF NOT EXISTS max_membros INT DEFAULT 50;",
    "ALTER TABLE salas ADD COLUMN IF NOT EXISTS created_by UUID NULL;",

    # 3. Mensagens (RF03, RF04, RF07, RN01)
    "ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS is_secret_mode BOOLEAN DEFAULT FALSE NOT NULL;",
    "ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS ttl_seconds INTEGER NULL;",
    "ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE NULL;",
    "ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS is_view_once BOOLEAN DEFAULT FALSE NOT NULL;",
    "ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS view_opened_at TIMESTAMP WITH TIME ZONE NULL;",
    "ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS is_e2ee BOOLEAN DEFAULT FALSE NOT NULL;",
    "ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS e2ee_envelope JSONB NULL;",

    # 4. Denúncias (RF06)
    "ALTER TABLE denuncias ADD COLUMN IF NOT EXISTS snapshot_mensagens JSONB DEFAULT '[]'::jsonb NOT NULL;",

    # 5. Tabelas novas (RF06, RF05, RF01, V3)
    """CREATE TABLE IF NOT EXISTS bloqueios_usuario (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        bloqueado_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT unique_usuario_bloqueado UNIQUE (usuario_id, bloqueado_id)
    );""",
    """CREATE TABLE IF NOT EXISTS recibos_mensagem (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        mensagem_id UUID NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
        usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'sent',
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT unique_recibo_status UNIQUE (mensagem_id, usuario_id, status)
    );""",
    """CREATE TABLE IF NOT EXISTS codigos_otp (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        telefone VARCHAR(30) NOT NULL,
        codigo_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        tentativas INTEGER DEFAULT 0 NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );""",
    """CREATE TABLE IF NOT EXISTS sessoes_ativas (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        device_name VARCHAR(100) NOT NULL DEFAULT 'Navegador Web',
        ip_address VARCHAR(45) NULL,
        user_agent TEXT NULL,
        token_jti VARCHAR(64) UNIQUE NOT NULL,
        last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );""",
    """CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sala_id UUID NULL REFERENCES salas(id) ON DELETE SET NULL,
        usuario_id UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
        actor_nickname VARCHAR(50) NULL,
        action VARCHAR(50) NOT NULL,
        target_id VARCHAR(100) NULL,
        target_nickname VARCHAR(50) NULL,
        detalhes JSONB DEFAULT '{}'::jsonb NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );""",
    """CREATE TABLE IF NOT EXISTS room_webhooks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sala_id UUID NOT NULL REFERENCES salas(id) ON DELETE CASCADE,
        nome VARCHAR(100) NOT NULL DEFAULT 'Webhook Externo',
        token VARCHAR(128) UNIQUE NOT NULL,
        created_by UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );""",

    # 6. Índices
    "CREATE INDEX IF NOT EXISTS idx_bloqueios_usuario_id ON bloqueios_usuario(usuario_id);",
    "CREATE INDEX IF NOT EXISTS idx_bloqueios_bloqueado_id ON bloqueios_usuario(bloqueado_id);",
    "CREATE INDEX IF NOT EXISTS idx_mensagens_expires_at ON mensagens(expires_at) WHERE expires_at IS NOT NULL;",
    "CREATE INDEX IF NOT EXISTS idx_recibos_mensagem_id ON recibos_mensagem(mensagem_id);",
    "CREATE INDEX IF NOT EXISTS idx_recibos_usuario_id ON recibos_mensagem(usuario_id);",
    "CREATE INDEX IF NOT EXISTS idx_codigos_otp_telefone ON codigos_otp(telefone);",
    "CREATE INDEX IF NOT EXISTS idx_sessoes_usuario_id ON sessoes_ativas(usuario_id);",
    "CREATE INDEX IF NOT EXISTS idx_sessoes_token_jti ON sessoes_ativas(token_jti);",
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_sala_id ON audit_logs(sala_id);",
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);",
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_usuario_id ON audit_logs(usuario_id);",
    "CREATE INDEX IF NOT EXISTS idx_room_webhooks_sala_id ON room_webhooks(sala_id);",
    "CREATE INDEX IF NOT EXISTS idx_room_webhooks_token ON room_webhooks(token);"
]


def run_auto_migrations(engine):
    """
    Executa a sincronização idempotente de schema no banco de dados na inicialização da aplicação.
    Garante que colunas e tabelas novas sejam criadas tanto no Supabase/PostgreSQL quanto no SQLite.
    """
    if not engine:
        return

    try:
        dialect_name = engine.dialect.name
        print(f"[AUTO-MIGRATIONS] Executando sincronização de schema para dialeto: '{dialect_name}'...")

        if dialect_name == "postgresql":
            with engine.connect() as conn:
                try:
                    conn.execute(text("SET lock_timeout = '4s';"))
                    conn.execute(text("SET statement_timeout = '6s';"))
                    conn.commit()
                except Exception:
                    pass
                for sql_stmt in POSTGRES_MIGRATIONS:
                    try:
                        conn.execute(text(sql_stmt))
                        conn.commit()
                    except Exception as e:
                        try:
                            conn.rollback()
                        except Exception:
                            pass
                        print(f"[AUTO-MIGRATIONS WARNING] Instrução ignorada ({sql_stmt[:35]}...): {e}")
            print("[AUTO-MIGRATIONS] Sincronização PostgreSQL concluída com sucesso.")

        elif dialect_name == "sqlite":
            with engine.connect() as conn:
                inspector = inspect(engine)
                existing_tables = inspector.get_table_names()

                def add_col_sqlite(table, col_name, col_def):
                    if table in existing_tables:
                        cols = [c["name"] for c in inspector.get_columns(table)]
                        if col_name not in cols:
                            try:
                                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def};"))
                                conn.commit()
                            except Exception as e:
                                print(f"[AUTO-MIGRATIONS SQLite] Aviso ao adicionar coluna {table}.{col_name}: {e}")

                add_col_sqlite("usuarios", "telefone", "VARCHAR(30) NULL")
                add_col_sqlite("usuarios", "public_key_e2ee", "TEXT NULL")
                add_col_sqlite("usuarios", "is_guest", "BOOLEAN DEFAULT 0 NOT NULL")
                add_col_sqlite("salas", "is_secret_mode", "BOOLEAN DEFAULT 0 NOT NULL")
                add_col_sqlite("mensagens", "is_secret_mode", "BOOLEAN DEFAULT 0 NOT NULL")
                add_col_sqlite("mensagens", "ttl_seconds", "INTEGER NULL")
                add_col_sqlite("mensagens", "expires_at", "DATETIME NULL")
                add_col_sqlite("mensagens", "is_view_once", "BOOLEAN DEFAULT 0 NOT NULL")
                add_col_sqlite("mensagens", "view_opened_at", "DATETIME NULL")
                add_col_sqlite("mensagens", "is_e2ee", "BOOLEAN DEFAULT 0 NOT NULL")
                add_col_sqlite("mensagens", "e2ee_envelope", "TEXT NULL")
                add_col_sqlite("denuncias", "snapshot_mensagens", "TEXT DEFAULT '[]' NOT NULL")
            print("[AUTO-MIGRATIONS] Sincronização SQLite concluída com sucesso.")
    except Exception as e:
        print(f"[AUTO-MIGRATIONS ERROR] Falha geral ao executar migrações: {e}")
