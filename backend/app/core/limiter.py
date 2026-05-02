"""Shared rate limiter instance — imported by main.py and endpoints.
Falls back to a no-op limiter if slowapi is not installed.
"""
try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address

    limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
except ImportError:
    # Fallback: no-op limiter so decorators don't crash when slowapi isn't installed
    class _NoOpLimiter:
        def limit(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator

    limiter = _NoOpLimiter()  # type: ignore[assignment]
