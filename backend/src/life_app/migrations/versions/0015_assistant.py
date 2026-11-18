"""Private assistant conversations, credentials, memory and atomic operation receipts."""

import sqlalchemy as sa
from alembic import op

revision = "0015_assistant"
down_revision = "0014_sport_ux"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE assistant_conversations (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    title VARCHAR(160) NOT NULL,
    archived BOOLEAN NOT NULL,
    summary TEXT NOT NULL,
    summary_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)
    op.execute("""
    CREATE INDEX ix_assistant_conversations_user_id ON assistant_conversations (user_id)
    """)
    op.execute("""
    CREATE INDEX ix_assistant_conversations_updated_at ON assistant_conversations (updated_at)
    """)
    op.execute("""
    CREATE TABLE assistant_settings (
    user_id UUID NOT NULL,
    provider VARCHAR(20) NOT NULL,
    model VARCHAR(120) NOT NULL,
    ciphertext TEXT,
    token_hint VARCHAR(12),
    memory_enabled BOOLEAN NOT NULL,
    memory_version INTEGER NOT NULL,
    memory_cutoff TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (user_id),
    CHECK (provider IN ('openai', 'anthropic', 'gemini')),
    CHECK (memory_version > 0),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)
    op.execute("""
    CREATE TABLE assistant_messages (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    role VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(16) NOT NULL,
    snippets JSONB NOT NULL,
    run_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CHECK (role IN ('user', 'assistant')),
    CHECK (status IN ('complete', 'running', 'interrupted', 'failed')),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY(conversation_id) REFERENCES assistant_conversations (id) ON DELETE CASCADE
    )
    """)
    op.execute("""
    CREATE INDEX ix_assistant_messages_conversation_id ON assistant_messages (conversation_id)
    """)
    op.execute("""
    CREATE INDEX ix_assistant_messages_user_id ON assistant_messages (user_id)
    """)
    op.execute("""
    CREATE INDEX ix_assistant_messages_created_at ON assistant_messages (created_at)
    """)
    op.execute("""
    CREATE TABLE assistant_memories (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    content VARCHAR(1000) NOT NULL,
    category VARCHAR(40) NOT NULL,
    source_conversation_id UUID,
    source_message_id UUID,
    source_excerpt VARCHAR(1000),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY(source_conversation_id) REFERENCES assistant_conversations (id) ON DELETE SET NULL,
    FOREIGN KEY(source_message_id) REFERENCES assistant_messages (id) ON DELETE SET NULL
    )
    """)
    op.execute("""
    CREATE INDEX ix_assistant_memories_user_id ON assistant_memories (user_id)
    """)
    op.execute("""
    CREATE TABLE assistant_runs (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    message_id UUID NOT NULL,
    request_id UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL,
    cancelled BOOLEAN NOT NULL,
    memory_version INTEGER NOT NULL,
    session_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (user_id, request_id),
    CHECK (status IN ('running', 'complete', 'interrupted', 'failed')),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY(conversation_id) REFERENCES assistant_conversations (id) ON DELETE CASCADE,
    FOREIGN KEY(message_id) REFERENCES assistant_messages (id) ON DELETE CASCADE
    )
    """)
    op.execute("""
    CREATE INDEX ix_assistant_runs_user_id ON assistant_runs (user_id)
    """)
    op.execute("""
    CREATE INDEX ix_assistant_runs_conversation_id ON assistant_runs (conversation_id)
    """)
    op.execute("""
    CREATE TABLE assistant_operations (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    run_id UUID NOT NULL,
    step INTEGER NOT NULL,
    application_id VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    arguments JSONB NOT NULL,
    argument_hash VARCHAR(64) NOT NULL,
    precondition TEXT,
    status VARCHAR(16) NOT NULL,
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (run_id, step),
    CHECK (status IN ('preview', 'complete', 'failed')),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY(run_id) REFERENCES assistant_runs (id) ON DELETE CASCADE
    )
    """)
    op.execute("""
    CREATE INDEX ix_assistant_operations_run_id ON assistant_operations (run_id)
    """)
    op.execute("""
    CREATE INDEX ix_assistant_operations_user_id ON assistant_operations (user_id)
    """)
    op.execute("""
    CREATE TABLE assistant_run_events (
    id UUID NOT NULL,
    run_id UUID NOT NULL,
    sequence INTEGER NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (run_id, sequence),
    FOREIGN KEY(run_id) REFERENCES assistant_runs (id) ON DELETE CASCADE
    )
    """)
    op.execute("""
    CREATE INDEX ix_assistant_run_events_run_id ON assistant_run_events (run_id)
    """)


def downgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT EXISTS(SELECT 1 FROM assistant_run_events)")):
        raise RuntimeError("Assistant data exists: restore a compatible backup instead.")
    if connection.scalar(sa.text("SELECT EXISTS(SELECT 1 FROM assistant_operations)")):
        raise RuntimeError("Assistant data exists: restore a compatible backup instead.")
    if connection.scalar(sa.text("SELECT EXISTS(SELECT 1 FROM assistant_runs)")):
        raise RuntimeError("Assistant data exists: restore a compatible backup instead.")
    if connection.scalar(sa.text("SELECT EXISTS(SELECT 1 FROM assistant_memories)")):
        raise RuntimeError("Assistant data exists: restore a compatible backup instead.")
    if connection.scalar(sa.text("SELECT EXISTS(SELECT 1 FROM assistant_messages)")):
        raise RuntimeError("Assistant data exists: restore a compatible backup instead.")
    if connection.scalar(sa.text("SELECT EXISTS(SELECT 1 FROM assistant_settings)")):
        raise RuntimeError("Assistant data exists: restore a compatible backup instead.")
    if connection.scalar(sa.text("SELECT EXISTS(SELECT 1 FROM assistant_conversations)")):
        raise RuntimeError("Assistant data exists: restore a compatible backup instead.")
    op.drop_table("assistant_run_events")
    op.drop_table("assistant_operations")
    op.drop_table("assistant_runs")
    op.drop_table("assistant_memories")
    op.drop_table("assistant_messages")
    op.drop_table("assistant_settings")
    op.drop_table("assistant_conversations")
