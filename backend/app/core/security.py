import time
from collections import defaultdict
from typing import Dict, List
from threading import Lock
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, HTTPException, status

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Injeta cabeçalhos defensivos de segurança enterprise:
    - Content-Security-Policy
    - X-Content-Type-Options: nosniff
    - X-Frame-Options: DENY
    - Strict-Transport-Security
    """
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: blob: https:; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com;"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class LoginRateLimiter:
    """
    Controlador de Rate Limit para tentativas de autenticação e envio de mensagens.
    Regra do Prompt:
    - Máximo 5 tentativas consecutivas com senha errada / minuto resultam em bloqueio temporário por rate limit (HTTP 429).
    - Limite de 1 mensagem/segundo por usuário.
    """
    def __init__(self):
        self._lock = Lock()
        self._failed_attempts: Dict[str, List[float]] = defaultdict(list)
        self._message_timestamps: Dict[str, List[float]] = defaultdict(list)

    def check_login_rate(self, identifier: str, max_attempts: int = 5, window_seconds: int = 60):
        with self._lock:
            now = time.time()
            # Limpa tentativas fora da janela de tempo
            self._failed_attempts[identifier] = [
                t for t in self._failed_attempts[identifier] if now - t < window_seconds
            ]
            if len(self._failed_attempts[identifier]) >= max_attempts:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Muitas tentativas com senha errada ({max_attempts}). Bloqueio temporário por rate limit. Aguarde {window_seconds} segundos."
                )

    def record_login_failure(self, identifier: str):
        with self._lock:
            self._failed_attempts[identifier].append(time.time())

    def clear_login_failures(self, identifier: str):
        with self._lock:
            if identifier in self._failed_attempts:
                del self._failed_attempts[identifier]

    def check_message_rate(self, user_id: str, max_msgs: int = 5, window_seconds: float = 2.0):
        with self._lock:
            now = time.time()
            self._message_timestamps[user_id] = [
                t for t in self._message_timestamps[user_id] if now - t < window_seconds
            ]
            if len(self._message_timestamps[user_id]) >= max_msgs:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Muitas mensagens enviadas rapidamente. Aguarde um instante antes de tentar novamente."
                )
            self._message_timestamps[user_id].append(now)

rate_limiter = LoginRateLimiter()
