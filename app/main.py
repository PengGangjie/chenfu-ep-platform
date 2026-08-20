# -*- coding: utf-8 -*-
"""《沉浮》EP · FastAPI：主页公开；播放页 / 歌词卡 / 音频需登录。"""
from __future__ import annotations

import os
from typing import Union
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from logto import LogtoClient, LogtoConfig, Storage, UserInfoScope
from starlette.middleware.sessions import SessionMiddleware

from .config import get_settings
from .db import ping_db, upsert_user

# 未登录可访问：健康检查、登录流、主页与主页资源（/assets/ 仅为 Hub）
PUBLIC_EXACT = {"/", "/index.html", "/favicon.ico", "/cloud-auth.js", "/cloud-ui.css"}
PUBLIC_PREFIXES = (
    "/health",
    "/sign-in",
    "/callback",
    "/sign-out",
    "/api/me",
    "/assets/",
)

# 受保护：四曲章节、播放器、歌词卡、音频
PROTECTED_PREFIXES = (
    "/%E3%80%8A",  # 《 URL 编码前缀兜底
    "/《饵》",
    "/《鲨鱼》",
    "/《潜水艇》",
    "/《火山群岛》",
)
AUDIO_SUFFIXES = (".mp3", ".m4a", ".wav", ".flac", ".ogg")

settings = get_settings()
app = FastAPI(title="《沉浮》EP")


class SessionStorage(Storage):
    def __init__(self, session: dict) -> None:
        self._session = session

    def get(self, key: str) -> Union[str, None]:
        val = self._session.get(key)
        return None if val is None else str(val)

    def set(self, key: str, value: Union[str, None]) -> None:
        if value is None:
            self._session.pop(key, None)
        else:
            self._session[key] = value

    def delete(self, key: str) -> None:
        self._session.pop(key, None)


def logto_client(request: Request) -> LogtoClient:
    return LogtoClient(
        LogtoConfig(
            endpoint=settings.logto_endpoint,
            appId=settings.logto_app_id,
            appSecret=settings.logto_app_secret,
            scopes=[UserInfoScope.email, UserInfoScope.phone],
        ),
        storage=SessionStorage(request.session),
    )


def auth_configured() -> bool:
    return bool(settings.logto_endpoint and settings.logto_app_id and settings.logto_app_secret)


def current_sub(request: Request) -> str | None:
    if not auth_configured():
        return None
    client = logto_client(request)
    if not client.isAuthenticated():
        return None
    claims = client.getIdTokenClaims()
    return claims.sub if claims else None


def is_public_path(path: str) -> bool:
    if path in PUBLIC_EXACT:
        return True
    if any(path.startswith(p) for p in PUBLIC_PREFIXES):
        return True
    # Hub 根级样式/脚本（偶发无前缀）
    if path.endswith((".css", ".js", ".map", ".ico", ".svg", ".webmanifest")) and "/" not in path.lstrip("/"):
        return True
    return False


def needs_login(path: str) -> bool:
    lower = path.lower()
    if any(lower.endswith(s) for s in AUDIO_SUFFIXES):
        return True
    if any(path.startswith(p) for p in PROTECTED_PREFIXES):
        return True
    # 未编码的中文路径（Starlette 通常已解码）
    for name in ("饵", "鲨鱼", "潜水艇", "火山群岛"):
        if f"/{name}" in path or path.startswith(f"/《{name}》"):
            return True
    return False


def safe_return_to(raw: str | None) -> str:
    if not raw:
        return "/"
    raw = raw.strip()
    if not raw.startswith("/") or raw.startswith("//"):
        return "/"
    return raw


@app.middleware("http")
async def require_auth(request: Request, call_next):
    path = request.url.path
    if is_public_path(path):
        return await call_next(request)
    if not settings.auth_required or not auth_configured():
        # 未配 Logto 时本地可全开；线上部署须配好并 AUTH_REQUIRED=true
        return await call_next(request)
    if not needs_login(path):
        # 其他未知路径：若已登录放行，否则回主页（避免误拦）
        if current_sub(request):
            return await call_next(request)
        if path.startswith("/api/"):
            return JSONResponse({"detail": "未登录"}, status_code=401)
        return RedirectResponse("/")

    if current_sub(request):
        return await call_next(request)
    if path.startswith("/api/"):
        return JSONResponse({"detail": "未登录"}, status_code=401)
    ret = quote(path, safe="/")
    return RedirectResponse(f"/sign-in?return_to={ret}")


app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    session_cookie="chenfu_ep_session",
    https_only=settings.logto_redirect_uri.startswith("https://"),
    same_site="lax",
    max_age=14 * 24 * 3600,
)


@app.get("/health")
async def health():
    body = {"status": "ok", "app": settings.app_name, "auth": auth_configured(), "auth_required": settings.auth_required}
    try:
        body["db"] = ping_db()
    except Exception as exc:  # noqa: BLE001
        body["db"] = "skipped"
        body["db_note"] = str(exc)
    return body


@app.get("/sign-in")
async def sign_in(request: Request):
    if not auth_configured():
        return JSONResponse({"detail": "未配置 Logto"}, status_code=503)
    request.session["return_to"] = safe_return_to(request.query_params.get("return_to"))
    client = logto_client(request)
    url = await client.signIn(redirectUri=settings.logto_redirect_uri)
    return RedirectResponse(url)


@app.get("/callback")
async def callback(request: Request):
    if not request.query_params.get("code"):
        return RedirectResponse("/sign-in")
    client = logto_client(request)
    try:
        await client.handleSignInCallback(str(request.url))
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            {"detail": "登录回调失败", "reason": str(exc), "sign_in": "/sign-in"},
            status_code=400,
        )
    claims = client.getIdTokenClaims()
    if claims and claims.sub:
        try:
            upsert_user(
                claims.sub,
                getattr(claims, "email", None),
                getattr(claims, "name", None),
                getattr(claims, "phone_number", None),
            )
        except Exception:  # noqa: BLE001
            pass
    dest = safe_return_to(request.session.pop("return_to", "/"))
    return RedirectResponse(dest)


@app.get("/sign-out")
async def sign_out(request: Request):
    if not auth_configured():
        return RedirectResponse("/")
    client = logto_client(request)
    url = await client.signOut(postLogoutRedirectUri=settings.logto_post_logout_uri)
    return RedirectResponse(url)


@app.get("/api/me")
async def me(request: Request):
    sub = current_sub(request)
    if not sub:
        return {"authenticated": False, "auth_configured": auth_configured(), "auth_required": settings.auth_required}
    client = logto_client(request)
    claims = client.getIdTokenClaims()
    return {
        "authenticated": True,
        "sub": sub,
        "email": getattr(claims, "email", None) if claims else None,
        "phone": getattr(claims, "phone_number", None) if claims else None,
        "name": getattr(claims, "name", None) if claims else None,
        "auth_required": settings.auth_required,
    }


static_dir = settings.static_dir
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")


def main() -> None:
    import uvicorn

    port = int(os.getenv("PORT", settings.port))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
