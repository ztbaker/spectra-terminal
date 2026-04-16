from typing import Iterable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from config import settings


class SharedKeyMiddleware(BaseHTTPMiddleware):
    """Reject requests missing the shared X-Spectra-Key header.

    Exempt paths (health checks, docs) are allowed through unauthenticated.
    If SPECTRA_SHARED_KEY is empty (local dev), the middleware is a no-op.
    """

    def __init__(self, app, exempt_paths: Iterable[str] = ()):
        super().__init__(app)
        self.exempt = tuple(exempt_paths)

    async def dispatch(self, request: Request, call_next):
        expected = settings.SPECTRA_SHARED_KEY
        if not expected:
            return await call_next(request)

        if any(request.url.path.startswith(p) for p in self.exempt):
            return await call_next(request)

        if request.method == "OPTIONS":
            return await call_next(request)

        provided = request.headers.get("x-spectra-key", "")
        if provided != expected:
            return JSONResponse({"detail": "unauthorized"}, status_code=401)

        return await call_next(request)
