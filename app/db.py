# -*- coding: utf-8 -*-
"""Turso：可选用户表（《沉浮》EP 仅登录门禁，无工具箱状态同步）。"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from libsql_client import create_client_sync

from .config import get_settings

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS ep_users (
  logto_sub TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


@contextmanager
def turso_client() -> Iterator:
    settings = get_settings()
    if not settings.turso_database_url or not settings.turso_auth_token:
        raise RuntimeError("Turso 未配置")
    client = create_client_sync(settings.turso_database_url, auth_token=settings.turso_auth_token)
    try:
        yield client
    finally:
        client.close()


def ensure_schema() -> None:
    with turso_client() as client:
        for stmt in SCHEMA_SQL.split(";"):
            stmt = stmt.strip()
            if stmt:
                client.execute(stmt)


def ping_db() -> str:
    ensure_schema()
    with turso_client() as client:
        n = client.execute("SELECT COUNT(*) FROM ep_users").rows[0][0]
        return f"ep_users:{n}"


def upsert_user(sub: str, email: str | None, name: str | None, phone: str | None = None) -> None:
    if not get_settings().turso_database_url or not get_settings().turso_auth_token:
        return
    ensure_schema()
    with turso_client() as client:
        client.execute(
            """
            INSERT INTO ep_users (logto_sub, email, name, phone)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(logto_sub) DO UPDATE SET
              email = COALESCE(excluded.email, ep_users.email),
              name = COALESCE(excluded.name, ep_users.name),
              phone = COALESCE(excluded.phone, ep_users.phone),
              updated_at = datetime('now')
            """,
            [sub, email, name, phone],
        )
