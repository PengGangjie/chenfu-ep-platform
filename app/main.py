# -*- coding: utf-8 -*-
"""《沉浮》EP · FastAPI：全站公开；未登录用会话访客写入留言仓。"""
from __future__ import annotations

import os
import re
import uuid
from typing import Any, Union
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from logto import LogtoClient, LogtoConfig, Storage, UserInfoScope
from starlette.middleware.sessions import SessionMiddleware

from .catalog import CAROUSEL_IMAGES, DEV_ANNOUNCEMENTS, FEELINGS, SONGS, song_or_none
from .config import get_settings
from .db import (
    add_comment,
    add_dev_message,
    board_payload,
    clear_comment_rating,
    delete_comment,
    delete_dev_message,
    list_dev_messages,
    ping_db,
    toggle_heart,
    toggle_like,
    upsert_play,
    upsert_user,
)

# 未登录可访问：健康检查、登录流、主页与主页资源（/assets/ 仅为 Hub）
PUBLIC_EXACT = {
    "/",
    "/index.html",
    "/favicon.ico",
    "/board.html",
    "/cloud-auth.js",
    "/cloud-ui.css",
    "/cloud-player.js",
    "/cloud-board.js",
}
PUBLIC_PREFIXES = (
    "/health",
    "/sign-in",
    "/callback",
    "/sign-out",
    "/api/me",
    "/assets/",
    "/brand/",
    "/icons/",
)
PUBLIC_GET_PREFIXES = ("/api/board",)
SOCIAL_API_PREFIX = "/api/ep/"
ADMIN_API_PREFIX = "/api/ep/admin/"
GUEST_KEY_RE = re.compile(r"^guest-[a-f0-9]{12}$")

# 受保护：四曲章节、播放器、歌词卡、音频
PROTECTED_PREFIXES = (
    "/%E3%80%8A",  # 《 URL 编码前缀兜底
    "/《饵》",
    "/《鲨鱼》",
    "/《潜水艇》",
    "/《火山群岛》",
)
AUDIO_SUFFIXES = (".mp3", ".m4a", ".wav", ".flac", ".ogg")
# 样式/脚本/封面图必须公开，否则登录后 <link rel=stylesheet> 仍会 307 到 HTML，页面会变成无样式
PUBLIC_STATIC_SUFFIXES = (
    ".css",
    ".js",
    ".map",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".json",
    ".webmanifest",
)

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


def parse_guest_key(raw: str | None) -> str | None:
    if not raw:
        return None
    key = str(raw).strip()
    return key if GUEST_KEY_RE.match(key) else None


def current_actor(request: Request, guest_key: str | None = None) -> str:
    """登录用户；否则用会话 + 客户端 guest_key 识别访客并写入后台。"""
    sub = current_sub(request)
    if sub:
        return sub
    gid = parse_guest_key(guest_key) or parse_guest_key(request.session.get("guest_id"))
    if not gid:
        gid = "guest-" + uuid.uuid4().hex[:12]
    request.session["guest_id"] = gid
    return gid


def ensure_actor_user(actor: str) -> None:
    if not actor.startswith("guest-"):
        return
    try:
        upsert_user(actor, None, "访客", None)
    except Exception:  # noqa: BLE001
        pass


def current_user_email(request: Request) -> str | None:
    if not auth_configured() or not current_sub(request):
        return None
    claims = logto_client(request).getIdTokenClaims()
    email = getattr(claims, "email", None) if claims else None
    return str(email).strip() if email else None


def is_admin(request: Request) -> bool:
    email = current_user_email(request)
    if not email or not settings.admin_emails:
        return False
    return email.lower() in settings.admin_emails


def admin_payload(request: Request) -> dict[str, Any]:
    return {
        "is_admin": is_admin(request),
        "admin_configured": bool(settings.admin_emails),
    }


async def read_json_body(request: Request) -> dict[str, Any]:
    try:
        data = await request.json()
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def is_public_path(path: str) -> bool:
    if path in PUBLIC_EXACT:
        return True
    if any(path.startswith(p) for p in PUBLIC_PREFIXES):
        return True
    lower = path.lower()
    if any(lower.endswith(s) for s in AUDIO_SUFFIXES):
        return True
    if any(lower.endswith(s) for s in PUBLIC_STATIC_SUFFIXES):
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
    if request.method in ("GET", "HEAD") and any(path.startswith(p) for p in PUBLIC_GET_PREFIXES):
        return await call_next(request)
    if path.startswith(SOCIAL_API_PREFIX) and request.method == "POST":
        return await call_next(request)
    if path.startswith(ADMIN_API_PREFIX):
        return await call_next(request)
    if not settings.auth_required:
        return await call_next(request)
    # AUTH_REQUIRED=true：未配 Logto 也不得放行播放/音频
    if current_sub(request):
        return await call_next(request)
    if needs_login(path):
        if path.startswith("/api/"):
            return JSONResponse({"detail": "未登录"}, status_code=401)
        ret = quote(path, safe="/")
        return RedirectResponse(f"/sign-in?return_to={ret}")
    if path.startswith("/api/"):
        return JSONResponse({"detail": "未登录"}, status_code=401)
    return RedirectResponse("/")


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
        return HTMLResponse(
            """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>登录 — 《沉浮》EP</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>body{font-family:sans-serif;background:#0b1014;color:#f5f7fa;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
main{max-width:28rem;padding:2rem;text-align:center}a{color:#9fe8ff}</style></head>
<body><main>
<h1>《沉浮》EP</h1>
<p>主页可公开浏览。听歌与歌词卡需要登录；当前尚未配置独立 Logto 应用。</p>
<p><a href="/">返回主页</a></p>
</main></body></html>""",
            status_code=503,
        )
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
async def me(request: Request, guest_key: str | None = None):
    sub = current_sub(request)
    if sub:
        client = logto_client(request)
        claims = client.getIdTokenClaims()
        return {
            "authenticated": True,
            "sub": sub,
            "email": getattr(claims, "email", None) if claims else None,
            "phone": getattr(claims, "phone_number", None) if claims else None,
            "name": getattr(claims, "name", None) if claims else None,
            "auth_required": settings.auth_required,
            "auth_configured": auth_configured(),
            "guest": False,
            **admin_payload(request),
        }
    actor = current_actor(request, guest_key)
    ensure_actor_user(actor)
    return {
        "authenticated": False,
        "guest": True,
        "guest_id": actor,
        "auth_configured": auth_configured(),
        "auth_required": settings.auth_required,
        **admin_payload(request),
    }


def _json_error(exc: Exception, status: int = 400) -> JSONResponse:
    return JSONResponse({"detail": str(exc)}, status_code=status)


@app.get("/api/board")
async def api_board(request: Request, song: str | None = None, section: str | None = None, guest_key: str | None = None):
    actor = current_actor(request, guest_key)
    ensure_actor_user(actor)
    sec = (section or "").strip().lower()
    try:
        body = board_payload(actor, song)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"db": False, "detail": str(exc), "songs": list(SONGS), "ranking": [], "comments": [], "popular_lyrics": []}, status_code=200)
    body["me"] = {
        "authenticated": bool(current_sub(request)),
        "actor": actor,
        "guest": bool(actor.startswith("guest-")),
        "guest_id": actor if actor.startswith("guest-") else None,
        "auth_configured": auth_configured(),
        "auth_required": settings.auth_required,
        "feelings": list(FEELINGS),
        **admin_payload(request),
    }
    if sec == "dev":
        body["section"] = "dev"
        body["carousel"] = list(CAROUSEL_IMAGES)
        body["announcements"] = list(DEV_ANNOUNCEMENTS)
        body["dev_messages"] = list_dev_messages(50)
    return body


@app.post("/api/ep/like")
async def api_like(request: Request):
    data = await read_json_body(request)
    actor = current_actor(request, str(data.get("guest_key") or ""))
    ensure_actor_user(actor)
    try:
        return toggle_like(actor, str(data.get("song_id") or ""))
    except ValueError as exc:
        return _json_error(exc)


@app.post("/api/ep/heart")
async def api_heart(request: Request):
    data = await read_json_body(request)
    actor = current_actor(request, str(data.get("guest_key") or ""))
    ensure_actor_user(actor)
    try:
        return toggle_heart(
            actor,
            str(data.get("song_id") or ""),
            str(data.get("line_key") or ""),
            str(data.get("lyric_text") or ""),
        )
    except ValueError as exc:
        return _json_error(exc)


@app.post("/api/ep/play")
async def api_play(request: Request):
    data = await read_json_body(request)
    actor = current_actor(request, str(data.get("guest_key") or ""))
    ensure_actor_user(actor)
    dur = data.get("duration_sec")
    try:
        dur_f = float(dur) if dur is not None and dur != "" else None
    except (TypeError, ValueError):
        dur_f = None
    try:
        return upsert_play(
            actor,
            str(data.get("song_id") or ""),
            str(data.get("session_key") or ""),
            float(data.get("max_ratio") or 0),
            dur_f,
        )
    except (ValueError, TypeError) as exc:
        return _json_error(exc)


@app.post("/api/ep/comment")
async def api_comment(request: Request):
    data = await read_json_body(request)
    actor = current_actor(request, str(data.get("guest_key") or ""))
    ensure_actor_user(actor)
    sid = song_or_none(str(data.get("song_id") or "")) if data.get("song_id") else None
    feeling = str(data.get("feeling") or "").strip()
    if feeling and feeling not in FEELINGS:
        feeling = None
    rating = data.get("rating")
    display_name_in = str(data.get("display_name") or "").strip()[:24] or None
    anonymous = bool(data.get("anonymous"))
    try:
        item = add_comment(
            actor,
            sid,
            str(data.get("body") or ""),
            feeling,
            rating,
            display_name_in,
            anonymous,
        )
    except ValueError as exc:
        code = 429 if "稍后再" in str(exc) else 400
        return _json_error(exc, code)
    item["author"] = "你"
    return item


@app.post("/api/ep/dev-message")
async def api_dev_message(request: Request):
    data = await read_json_body(request)
    actor = current_actor(request, str(data.get("guest_key") or ""))
    ensure_actor_user(actor)
    try:
        item = add_dev_message(
            actor,
            str(data.get("body") or ""),
            str(data.get("display_name") or "").strip()[:24] or None,
            bool(data.get("anonymous")),
        )
    except ValueError as exc:
        code = 429 if "稍后再" in str(exc) else 400
        return _json_error(exc, code)
    item["author"] = "你"
    return item


@app.delete("/api/ep/admin/comment/{comment_id}")
async def admin_delete_comment(request: Request, comment_id: int):
    if not is_admin(request):
        return JSONResponse({"detail": "需要管理员权限"}, status_code=403)
    if not delete_comment(comment_id):
        return JSONResponse({"detail": "留言不存在"}, status_code=404)
    return {"ok": True, "id": comment_id}


@app.post("/api/ep/admin/comment/{comment_id}/clear-rating")
async def admin_clear_rating(request: Request, comment_id: int):
    if not is_admin(request):
        return JSONResponse({"detail": "需要管理员权限"}, status_code=403)
    if not clear_comment_rating(comment_id):
        return JSONResponse({"detail": "留言不存在"}, status_code=404)
    return {"ok": True, "id": comment_id}


@app.delete("/api/ep/admin/dev-message/{message_id}")
async def admin_delete_dev_message(request: Request, message_id: int):
    if not is_admin(request):
        return JSONResponse({"detail": "需要管理员权限"}, status_code=403)
    if not delete_dev_message(message_id):
        return JSONResponse({"detail": "留言不存在"}, status_code=404)
    return {"ok": True, "id": message_id}


static_dir = settings.static_dir
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")


def main() -> None:
    import uvicorn

    port = int(os.getenv("PORT", settings.port))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
