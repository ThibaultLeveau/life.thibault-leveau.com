import logging

from life_app.core.logging import PrivateAccessFilter


def test_access_logs_exclude_private_search_text():
    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        "",
        0,
        '%s - "%s %s HTTP/%s" %d',
        ("127.0.0.1", "GET", "/api/v1/tasks?search=private&token=secret", "1.1", 200),
        None,
    )
    assert PrivateAccessFilter().filter(record)
    assert "/api/v1/tasks HTTP/1.1" in record.getMessage()
    assert "private" not in record.getMessage()
    assert "secret" not in record.getMessage()
