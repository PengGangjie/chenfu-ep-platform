# -*- coding: utf-8 -*-
"""《沉浮》EP · 配置（密钥仅读 secrets/chenfu-ep，与实训科/人生量化分离）。"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
for candidate in (
    ROOT / "secrets" / "chenfu-ep" / ".env",
    Path(r"c:\00CS\text\secrets\chenfu-ep\.env"),
):
    if candidate.is_file():
        load_dotenv(candidate, override=False)
        break
load_dotenv(ROOT / ".env", override=False)


@dataclass(frozen=True)
class Settings:
    app_name: str
    session_secret: str
    auth_required: bool
    logto_endpoint: str
    logto_app_id: str
    logto_app_secret: str
    logto_redirect_uri: str
    logto_post_logout_uri: str
    turso_database_url: str
    turso_auth_token: str
    admin_emails: frozenset[str]
    static_dir: Path
    port: int


@lru_cache
def get_settings() -> Settings:
    static = ROOT / "static"
    redirect = os.getenv("LOGTO_REDIRECT_URI", "").strip()
    post_logout = os.getenv("LOGTO_POST_LOGOUT_URI", "").strip()
    base = os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8020").rstrip("/")
    if not redirect:
        redirect = f"{base}/callback"
    if not post_logout:
        post_logout = f"{base}/"
    turso_url = os.getenv("TURSO_DATABASE_URL", "").strip()
    if turso_url.startswith("libsql://"):
        turso_url = turso_url.replace("libsql://", "https://", 1)
    admin_raw = os.getenv("ADMIN_EMAILS", "")
    admin_emails = frozenset(e.strip().lower() for e in admin_raw.split(",") if e.strip())
    return Settings(
        app_name="chenfu-ep",
        session_secret=os.getenv("SESSION_SECRET", "dev-change-me-chenfu-ep"),
        auth_required=os.getenv("AUTH_REQUIRED", "false").lower() in {"1", "true", "yes"},
        logto_endpoint=os.getenv("LOGTO_ENDPOINT", "").strip(),
        logto_app_id=os.getenv("LOGTO_APP_ID", "").strip(),
        logto_app_secret=os.getenv("LOGTO_APP_SECRET", "").strip(),
        logto_redirect_uri=redirect,
        logto_post_logout_uri=post_logout,
        turso_database_url=turso_url,
        turso_auth_token=os.getenv("TURSO_AUTH_TOKEN", "").strip(),
        admin_emails=admin_emails,
        static_dir=static,
        port=int(os.getenv("PORT", "8020")),
    )
