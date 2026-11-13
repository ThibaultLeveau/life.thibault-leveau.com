"""Keep application and Uvicorn logging on the container's standard streams."""

import logging.config


class PrivateAccessFilter(logging.Filter):
    """Uvicorn logs paths, without search text or other query values."""

    def filter(self, record: logging.LogRecord) -> bool:
        if (
            record.name == "uvicorn.access"
            and isinstance(record.args, tuple)
            and len(record.args) == 5
        ):
            client, method, path, version, status = record.args
            record.args = (client, method, str(path).split("?", 1)[0], version, status)
        return True


def configure_logging(level: str) -> None:
    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {"private_access": {"()": PrivateAccessFilter}},
            "formatters": {
                "standard": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "standard",
                    "stream": "ext://sys.stdout",
                    "filters": ["private_access"],
                },
            },
            "root": {"handlers": ["console"], "level": level},
            "loggers": {
                "uvicorn": {"handlers": ["console"], "level": level, "propagate": False},
                "uvicorn.error": {"level": level},
                "uvicorn.access": {"handlers": ["console"], "level": level, "propagate": False},
            },
        }
    )
