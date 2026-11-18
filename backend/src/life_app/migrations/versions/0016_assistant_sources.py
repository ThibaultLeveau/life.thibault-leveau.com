"""Private multimodal sources and transient transcription configuration."""

import sqlalchemy as sa
from alembic import op

revision = "0016_assistant_sources"
down_revision = "0015_assistant"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "assistant_conversations",
        sa.Column("external_context", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute("""
    CREATE TABLE assistant_sources (
        id UUID NOT NULL,
        user_id UUID NOT NULL,
        conversation_id UUID,
        message_id UUID,
        kind VARCHAR(10) NOT NULL,
        name VARCHAR(200) NOT NULL,
        media_type VARCHAR(100) NOT NULL,
        size_bytes INTEGER NOT NULL,
        sha256 VARCHAR(64) NOT NULL,
        data BYTEA,
        extracted_text TEXT,
        url VARCHAR(2048),
        page_count INTEGER,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        removed_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        CHECK (kind IN ('file', 'web')),
        CHECK (size_bytes > 0),
        CHECK (page_count IS NULL OR page_count > 0),
        CHECK ((message_id IS NULL) = (conversation_id IS NULL)),
        CHECK (removed_at IS NULL OR (data IS NULL AND extracted_text IS NULL)),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY(conversation_id) REFERENCES assistant_conversations (id) ON DELETE CASCADE,
        FOREIGN KEY(message_id) REFERENCES assistant_messages (id) ON DELETE CASCADE
    )
    """)
    op.execute("""
    CREATE INDEX ix_assistant_sources_conversation_id ON assistant_sources (conversation_id)
    """)
    op.execute("""
    CREATE INDEX ix_assistant_sources_message_id ON assistant_sources (message_id)
    """)
    op.execute("""
    CREATE INDEX ix_assistant_sources_user_id ON assistant_sources (user_id)
    """)
    op.execute("""
    CREATE TABLE assistant_transcription_settings (
        user_id UUID NOT NULL,
        provider VARCHAR(20) NOT NULL,
        model VARCHAR(120) NOT NULL,
        use_chat_provider BOOLEAN NOT NULL,
        ciphertext TEXT,
        token_hint VARCHAR(12),
        lease_id UUID,
        lease_until TIMESTAMP WITH TIME ZONE,
        period_start TIMESTAMP WITH TIME ZONE,
        requests INTEGER NOT NULL,
        PRIMARY KEY (user_id),
        CHECK (provider IN ('openai', 'gemini')),
        CHECK (requests >= 0),
        FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)


def downgrade():
    connection = op.get_bind()
    for table in ("assistant_sources", "assistant_transcription_settings"):
        if connection.execute(sa.text(f"SELECT EXISTS(SELECT 1 FROM {table})")).scalar():
            raise RuntimeError(
                "Assistant data exists; restore a compatible backup before downgrade"
            )
    if connection.execute(
        sa.text("SELECT EXISTS(SELECT 1 FROM assistant_conversations WHERE external_context)")
    ).scalar():
        raise RuntimeError("Assistant data exists; external source safeguards must be preserved")
    op.drop_table("assistant_transcription_settings")
    op.drop_table("assistant_sources")
    op.drop_column("assistant_conversations", "external_context")
