"""Custom middleware for ContractIntel."""


class CoopMiddleware:
    """Ensure Cross-Origin-Opener-Policy header is always set.

    Render's reverse proxy may strip or override Django's built-in
    SECURE_CROSS_ORIGIN_OPENER_POLICY setting.  This middleware
    explicitly sets the header on every response so Google OAuth
    popups can communicate back via postMessage.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
        return response
