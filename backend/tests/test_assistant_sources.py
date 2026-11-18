"""HTTP ownership, reservations, immutable links and private source lifecycle."""

from datetime import timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, text

from life_app.apps.life_ai import documents, service, sources, web_sources
from life_app.apps.life_ai import models as m
from life_app.core.database import utcnow
from life_app.platform.auth.models import LoginSession, User

pytestmark = pytest.mark.usefixtures("life_ai_enabled")

BASE = "/api/v1/assistant/sources"


def upload(client, data=b"Private source text", name="notes.txt"):
    return client.post(
        BASE + "/files",
        params={"filename": name},
        content=data,
        headers={"Content-Type": "application/octet-stream"},
    )


def alice(db):
    return db.scalar(select(User).where(User.username == "alice"))


def test_upload_metadata_download_and_removal(authenticated_client):
    client = authenticated_client
    limits = client.get(BASE + "/limits")
    assert limits.status_code == 200
    assert limits.json()["max_sources"] == 4
    response = upload(client, "Privé éè".encode(), "../private/notes.txt")
    assert response.status_code == 201, response.text
    source = response.json()
    assert source["name"] == "notes.txt"
    assert source["size_bytes"] == len("Privé éè".encode())
    assert "data" not in source and "extracted_text" not in source
    assert client.get(BASE + "/" + source["id"]).json() == source
    download = client.get(BASE + "/" + source["id"] + "/content")
    assert download.content == "Privé éè".encode()
    assert download.headers["content-disposition"].startswith("attachment;")
    assert download.headers["x-content-type-options"] == "nosniff"
    assert download.headers["cache-control"] == "no-store"
    assert client.delete(BASE + "/" + source["id"]).status_code == 204
    assert client.get(BASE + "/" + source["id"]).json()["removed_at"] is not None
    assert client.get(BASE + "/" + source["id"] + "/content").status_code == 410
    assert client.delete(BASE + "/" + source["id"]).status_code == 204


def test_owner_and_csrf_protect_all_source_operations(app, authenticated_client):
    source = upload(authenticated_client).json()
    with TestClient(app) as bob:
        login = bob.post(
            "/api/v1/auth/session", json={"username": "bob", "password": "synthetic-test-password"}
        )
        bob.headers["X-CSRF-Token"] = login.json()["csrf_token"]
        for suffix in ["", "/content"]:
            assert bob.get(BASE + "/" + source["id"] + suffix).status_code == 404
        assert bob.delete(BASE + "/" + source["id"]).status_code == 404
    with TestClient(app) as anonymous:
        assert anonymous.get(BASE + "/" + source["id"]).status_code == 401
    authenticated_client.headers.pop("X-CSRF-Token")
    assert upload(authenticated_client).status_code == 403
    assert (
        authenticated_client.post(BASE + "/web", json={"url": "https://example.com"}).status_code
        == 403
    )
    assert authenticated_client.delete(BASE + "/" + source["id"]).status_code == 403


def test_invalid_import_does_not_leave_reservation_or_consume_quota(app, authenticated_client):
    assert upload(authenticated_client, b"not a PDF", "file.pdf").status_code == 422
    assert upload(authenticated_client, b"", "empty.txt").status_code == 422
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.Source)) == 0


@pytest.mark.parametrize("revoke", ["logout", "life_ai"])
def test_revoked_session_during_parser_discards_import_and_owner_lock_is_released(
    app, authenticated_client, monkeypatch, revoke
):
    def parse(data, filename):
        with app.state.sessions() as db:
            db.execute(text("SET LOCAL lock_timeout = '200ms'"))
            user = db.scalar(select(User).where(User.username == "alice").with_for_update())
            if revoke == "logout":
                db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
            else:
                db.execute(
                    text(
                        "UPDATE application_preferences SET enabled=false "
                        "WHERE user_id=:id AND application_id='life_ai'"
                    ),
                    {"id": user.id},
                )
            db.commit()
        return documents.ParsedDocument(filename, "text/plain", "parsed")

    monkeypatch.setattr(documents, "parse_document", parse)
    assert upload(authenticated_client).status_code == (401 if revoke == "logout" else 403)
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.Source)) == 0


def test_admission_reserves_quota_and_limits_parallel_imports(app):
    with app.state.sessions() as db:
        user = alice(db)
        for _ in range(2):
            sources.reserve(db, user, app.state.settings, kind="file", name="pending.txt")
        db.commit()
        with pytest.raises(HTTPException) as error:
            sources.reserve(db, user, app.state.settings, kind="file", name="third.txt")
        assert error.value.status_code == 429
        db.rollback()
        rows = db.scalars(select(m.Source)).all()
        for row in rows:
            row.created_at = utcnow() - timedelta(minutes=6)
        db.commit()
        sources.reserve(db, user, app.state.settings, kind="file", name="new.txt")
        db.commit()
        assert db.scalar(select(func.count()).select_from(m.Source)) == 1


def test_pending_quota_and_expiration_are_enforced(app, authenticated_client):
    source = upload(authenticated_client).json()
    with app.state.sessions() as db:
        user = alice(db)
        conversation = service.create_conversation(db, user, "Test")
        with pytest.raises(HTTPException) as duplicate:
            sources.validate_for_message(db, user, conversation, [source["id"], source["id"]])
        assert duplicate.value.status_code == 422
        row = db.get(m.Source, source["id"])
        row.created_at = utcnow() - timedelta(hours=25)
        db.commit()
        with pytest.raises(HTTPException) as expired:
            sources.validate_for_message(db, user, conversation, [row.id])
        assert expired.value.status_code == 409
        sources.cleanup_pending(db, user)
        db.commit()
        assert db.get(m.Source, row.id) is None


def test_sources_link_once_clear_summary_and_cascade_with_conversation(app, authenticated_client):
    source = upload(authenticated_client).json()
    with app.state.sessions() as db:
        user = alice(db)
        conversation = service.create_conversation(db, user, "Source lifecycle")
        conversation.external_context = True
        conversation.summary = "A summary mentioning private content"
        conversation.summary_until = utcnow()
        message = m.Message(
            user_id=user.id, conversation_id=conversation.id, role="user", content="Read"
        )
        db.add(message)
        db.flush()
        rows = sources.validate_for_message(db, user, conversation, [source["id"]])
        sources.attach_to_message(rows, message)
        db.commit()
        with pytest.raises(HTTPException) as already_bound:
            sources.validate_for_message(db, user, conversation, [source["id"]])
        assert already_bound.value.status_code == 409
        conversation_id = conversation.id
        blocks = sources.provider_blocks(rows)
        assert any("Private source text" in block.get("text", "") for block in blocks)
        assert all(block["source_id"] == source["id"] for block in blocks)
    assert authenticated_client.delete(BASE + "/" + source["id"]).status_code == 204
    with app.state.sessions() as db:
        conversation = db.get(m.Conversation, conversation_id)
        assert conversation.external_context is True
        assert conversation.summary == "" and conversation.summary_until is None
        row = db.get(m.Source, source["id"])
        assert row.data is None and row.extracted_text is None
        db.delete(conversation)
        db.commit()
        db.expire_all()
        assert db.get(m.Source, source["id"]) is None


def test_active_run_blocks_removal_of_attached_source(app, authenticated_client):
    source = upload(authenticated_client).json()
    with app.state.sessions() as db:
        user = alice(db)
        conversation = service.create_conversation(db, user, "Running")
        message = m.Message(
            user_id=user.id, conversation_id=conversation.id, role="assistant", content=""
        )
        db.add(message)
        db.flush()
        row = db.get(m.Source, source["id"])
        sources.attach_to_message([row], message)
        db.add(
            m.Run(
                user_id=user.id,
                conversation_id=conversation.id,
                message_id=message.id,
                request_id=uuid4(),
                request_hash="a" * 64,
                session_hash="b" * 64,
                memory_version=1,
            )
        )
        db.commit()
    assert authenticated_client.delete(BASE + "/" + source["id"]).status_code == 409
    assert authenticated_client.get(BASE + "/" + source["id"] + "/content").status_code == 200


def test_web_import_stores_safe_text_snapshot_and_clears_failed_reservations(
    app, authenticated_client, monkeypatch
):
    def fetch(url):
        return web_sources.WebDocument(
            url, "Example", "text/plain", b"Readable page", "Readable page"
        )

    monkeypatch.setattr(web_sources, "fetch_url", fetch)
    response = authenticated_client.post(BASE + "/web", json={"url": "https://example.com/page"})
    assert response.status_code == 201, response.text
    assert response.json()["kind"] == "web"
    assert response.json()["url"] == "https://example.com/page"
    downloaded = authenticated_client.get(BASE + "/" + response.json()["id"] + "/content")
    assert downloaded.content == b"Readable page"
    assert "Example.txt" in downloaded.headers["content-disposition"]

    def fail(url):
        raise documents.DocumentError("source_url_forbidden")

    monkeypatch.setattr(web_sources, "fetch_url", fail)
    assert (
        authenticated_client.post(BASE + "/web", json={"url": "https://internal.test"}).status_code
        == 422
    )
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(m.Source)) == 1


def test_message_limits_cover_cumulative_bytes_and_pdf_pages(app):
    with app.state.sessions() as db:
        user = alice(db)
        conversation = service.create_conversation(db, user, "Source budgets")
        rows = []
        for i in range(3):
            row = m.Source(
                user_id=user.id,
                kind="file",
                name=f"file{i}.pdf",
                media_type="application/pdf",
                size_bytes=8 * 1024 * 1024,
                sha256=str(i) * 64,
                data=b"synthetic PDF",
                page_count=20,
            )
            rows.append(row)
            db.add(row)
        db.flush()
        with pytest.raises(HTTPException) as size:
            sources.validate_for_message(db, user, conversation, [row.id for row in rows])
        assert size.value.status_code == 422
        for row in rows:
            row.size_bytes = 100
        db.flush()
        with pytest.raises(HTTPException) as pages:
            sources.validate_for_message(db, user, conversation, [row.id for row in rows])
        assert pages.value.status_code == 422
        assert sources.validate_for_message(db, user, conversation, [rows[0].id, rows[1].id])


def test_storage_quota_counts_outstanding_reservations_and_extracted_text(app):
    app.state.settings.assistant_source_quota_bytes = 20 * 1024 * 1024
    with app.state.sessions() as db:
        user = alice(db)
        row = m.Source(
            user_id=user.id,
            kind="file",
            name="large.txt",
            media_type="text/plain",
            size_bytes=10 * 1024 * 1024,
            sha256="a" * 64,
            data=b"synthetic",
            extracted_text="also stored",
        )
        db.add(row)
        db.commit()
        with pytest.raises(HTTPException) as quota:
            sources.reserve(db, user, app.state.settings, kind="file", name="reserved.txt")
        assert quota.value.status_code == 409
        row.extracted_text = None
        db.flush()
        sources.reserve(db, user, app.state.settings, kind="file", name="reserved.txt")
        db.commit()
        with pytest.raises(HTTPException) as second:
            sources.reserve(db, user, app.state.settings, kind="file", name="another.txt")
        assert second.value.status_code == 409


def test_draft_count_prevents_unbounded_small_file_imports(app):
    with app.state.sessions() as db:
        user = alice(db)
        for i in range(sources.MAX_PENDING_SOURCES):
            db.add(
                m.Source(
                    user_id=user.id,
                    kind="file",
                    name=f"small{i}.txt",
                    media_type="text/plain",
                    size_bytes=1,
                    sha256="a" * 64,
                    data=b"x",
                )
            )
        db.commit()
        with pytest.raises(HTTPException) as quota:
            sources.reserve(db, user, app.state.settings, kind="file", name="another.txt")
        assert quota.value.status_code == 409
