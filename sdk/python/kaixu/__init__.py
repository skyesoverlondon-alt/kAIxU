"""kaixu — Official Python client for the kAIxU AI gateway."""
from .client import (
    KaixuClient,
    KaixuError,
    KaixuAuthError,
    KaixuQuotaError,
    KaixuUpstreamError,
    GenerateResult,
    EmbedResult,
)

__version__ = "1.0.0"
__all__ = [
    "KaixuClient",
    "KaixuError",
    "KaixuAuthError",
    "KaixuQuotaError",
    "KaixuUpstreamError",
    "GenerateResult",
    "EmbedResult",
]
