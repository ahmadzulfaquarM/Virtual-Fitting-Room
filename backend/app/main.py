"""FastAPI entry point for the Virtual Fitting Room API.

Phase 1 exposes only a health endpoint. AI inference routes (scan upload,
reconstruction jobs, etc.) are added in later phases behind provider-independent
interfaces.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__

SERVICE_NAME = "fitting-room-api"

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(SERVICE_NAME)


def _allowed_origins() -> list[str]:
    """Comma-separated list from CORS_ALLOWED_ORIGINS; defaults to the Vite dev server."""
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    application = FastAPI(title="Virtual Fitting Room API", version=__version__)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @application.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok", "service": SERVICE_NAME, "version": __version__}

    logger.info("%s v%s initialised", SERVICE_NAME, __version__)
    return application


app = create_app()
