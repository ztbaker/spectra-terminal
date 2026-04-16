import logging
from typing import Any

from providers.registry import get_providers_for

logger = logging.getLogger(__name__)


async def try_providers(
    operation: str,
    method: str,
    *args: Any,
    **kwargs: Any,
) -> tuple[Any, str, bool]:
    """Try each provider for *operation* in priority order.

    Returns (result, provider_name, was_cached).
    Raises only if every provider fails.
    """
    providers = get_providers_for(operation)
    last_exc: Exception | None = None

    for provider in providers:
        try:
            fn = getattr(provider, method)
            result = await fn(*args, **kwargs)
            if result is not None:
                return result, provider.name, False
        except Exception as exc:
            last_exc = exc
            logger.debug(
                "Provider %s failed for %s/%s: %s", provider.name, operation, method, exc
            )
            continue

    if last_exc is not None:
        raise last_exc
    return None, "", False