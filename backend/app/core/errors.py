"""Consistent application errors and the public error envelope.

Envelope: {"code": str, "message": str, "request_id": str | None, "details": [...]?}
Never include stack traces, SQL, secrets or submitted values.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    status_code = 400
    code = "BAD_REQUEST"
    message = "The request could not be processed."

    def __init__(self, message: str | None = None, *, details: list[dict[str, str]] | None = None):
        super().__init__(message or self.message)
        self.message = message or self.message
        self.details = details


class AuthRequired(AppError):
    status_code = 401
    code = "AUTH_REQUIRED"
    message = "Authentication is required."


class InvalidCredentials(AppError):
    status_code = 401
    code = "INVALID_CREDENTIALS"
    message = "Email or password is incorrect."


class CsrfInvalid(AppError):
    status_code = 403
    code = "CSRF_INVALID"
    message = "The request could not be verified. Reload the page and try again."


class Forbidden(AppError):
    status_code = 403
    code = "FORBIDDEN"
    message = "You do not have permission to perform this action."


class RegistrationDisabled(AppError):
    status_code = 403
    code = "REGISTRATION_DISABLED"
    message = "Registration is not currently available."


class NotFound(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "The requested resource was not found."


class Conflict(AppError):
    status_code = 409
    code = "CONFLICT"
    message = "The request conflicts with existing data."


class EmailAlreadyRegistered(Conflict):
    code = "EMAIL_ALREADY_REGISTERED"
    message = "An account with this email already exists."


class RateLimited(AppError):
    status_code = 429
    code = "RATE_LIMITED"
    message = "Too many attempts. Please wait and try again."


class ServiceUnavailable(AppError):
    status_code = 503
    code = "SERVICE_UNAVAILABLE"
    message = "The service is temporarily unavailable."


class AiProviderNotConfigured(ServiceUnavailable):
    code = "AI_PROVIDER_NOT_CONFIGURED"
    message = "AI provider not configured. An administrator must configure an LLM provider."


class AiProviderFailed(AppError):
    status_code = 502
    code = "AI_PROVIDER_FAILED"
    message = "The AI provider could not complete the request. Please try again."


class AiOutputInvalid(AiProviderFailed):
    code = "AI_OUTPUT_INVALID"
    message = "The AI provider returned an unusable answer. Please try again."


def error_body(
    code: str, message: str, request_id: str | None, details: list[dict[str, str]] | None = None
) -> dict[str, Any]:
    body: dict[str, Any] = {"code": code, "message": message, "request_id": request_id}
    if details:
        body["details"] = details
    return body


def _request_id(request: Request) -> str | None:
    value = request.scope.get("state", {}).get("request_id")
    return value if isinstance(value, str) else None


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, _request_id(request), exc.details),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Deliberately omit "input"/"ctx": submitted values may contain passwords or PII.
        details = [
            {
                "field": ".".join(str(p) for p in err["loc"] if p != "body"),
                "message": str(err["msg"]),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=error_body(
                "VALIDATION_ERROR", "Some fields are invalid.", _request_id(request), details
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        mapping = {
            404: ("NOT_FOUND", "The requested resource was not found."),
            405: ("METHOD_NOT_ALLOWED", "This method is not allowed for the resource."),
        }
        code, message = mapping.get(exc.status_code, ("HTTP_ERROR", "The request failed."))
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(code, message, _request_id(request)),
            headers=getattr(exc, "headers", None),
        )
