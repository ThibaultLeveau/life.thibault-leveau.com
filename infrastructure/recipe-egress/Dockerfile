FROM python:3.13-slim-bookworm
ARG REVISION=development
LABEL org.opencontainers.image.revision=$REVISION
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY proxy.py .
USER 65534:65534
EXPOSE 3128
CMD ["python", "proxy.py"]
