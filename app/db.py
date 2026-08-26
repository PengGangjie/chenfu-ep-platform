# -*- coding: utf-8 -*-
"""Turso / 本地 SQLite：用户、点赞、歌词爱心、完播、留言。"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from libsql_client import create_client_sync

from .catalog import COMPLETE_RATIO, DEFAULT_NICK, SONGS, display_name, song_or_none
from .config import get_settings

SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS ep_users (
      logto_sub TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      phone TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ep_song_likes (
      logto_sub TEXT NOT NULL,
      song_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (logto_sub, song_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ep_lyric_hearts (
      logto_sub TEXT NOT NULL,
      song_id TEXT NOT NULL,
      line_key TEXT NOT NULL,
      lyric_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (logto_sub, song_id, line_key)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ep_play_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logto_sub TEXT NOT NULL,
      song_id TEXT NOT NULL,
      session_key TEXT NOT NULL,
      max_ratio REAL NOT NULL DEFAULT 0,
      duration_sec REAL,
      completed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (logto_sub, song_id, session_key)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ep_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logto_sub TEXT NOT NULL,
      song_id TEXT,
      body TEXT NOT NULL,
      feeling TEXT,
      rating INTEGER,
      display_name TEXT,
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS ep_dev_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      logto_sub TEXT NOT NULL,
      body TEXT NOT NULL,
      display_name TEXT,
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_ep_comments_song ON ep_comments(song_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_ep_plays_song ON ep_play_sessions(song_id)",
    "CREATE INDEX IF NOT EXISTS idx_ep_hearts_song ON ep_lyric_hearts(song_id)",
    "CREATE INDEX IF NOT EXISTS idx_ep_dev_messages_time ON ep_dev_messages(created_at DESC)",
)


class _Result:
    def __init__(self, rows: list[tuple[Any, ...]]) -> None:
        self.rows = rows


class SqliteAdapter:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def execute(self, sql: str, params: list[Any] | None = None) -> _Result:
        cur = self._conn.execute(sql, params or [])
        self._conn.commit()
        return _Result(list(cur.fetchall()))

    def close(self) -> None:
        self._conn.close()


def db_configured() -> bool:
    settings = get_settings()
    return bool(settings.turso_database_url and settings.turso_auth_token) or True


def local_db_path() -> Path:
    path = get_settings().static_dir.parent / "data" / "ep.db"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


@contextmanager
def turso_client() -> Iterator:
    settings = get_settings()
    if settings.turso_database_url and settings.turso_auth_token:
        client = create_client_sync(settings.turso_database_url, auth_token=settings.turso_auth_token)
        try:
            yield client
        finally:
            client.close()
        return
    conn = sqlite3.connect(str(local_db_path()), timeout=8)
    conn.row_factory = sqlite3.Row
    adapter = SqliteAdapter(conn)
    try:
        yield adapter
    finally:
        adapter.close()


def using_turso() -> bool:
    settings = get_settings()
    return bool(settings.turso_database_url and settings.turso_auth_token)


_schema_ready = False


def ensure_schema() -> None:
    global _schema_ready
    if _schema_ready:
        return
    with turso_client() as client:
        for stmt in SCHEMA_STATEMENTS:
            client.execute(stmt.strip())
        _migrate_columns(client)
    _schema_ready = True


def _migrate_columns(client) -> None:
    migrations = (
        ("ep_comments", ("display_name", "TEXT"), ("is_anonymous", "INTEGER NOT NULL DEFAULT 0")),
        ("ep_dev_messages", ("display_name", "TEXT"), ("is_anonymous", "INTEGER NOT NULL DEFAULT 0")),
    )
    for table, *cols in migrations:
        existing = {str(r[1]) for r in client.execute(f"PRAGMA table_info({table})").rows}
        for col, typedef in cols:
            if col not in existing:
                client.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typedef}")


def ping_db() -> str:
    ensure_schema()
    with turso_client() as client:
        n = client.execute("SELECT COUNT(*) FROM ep_users").rows[0][0]
        backend = "turso" if using_turso() else "sqlite"
        return f"{backend}:ep_users:{n}"


def upsert_user(sub: str, email: str | None, name: str | None, phone: str | None = None) -> None:
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


def _count_map_client(client, sql: str, params: list[Any] | None = None) -> dict[str, int]:
    out: dict[str, int] = {}
    for row in client.execute(sql, params or []).rows:
        if row[0] is None:
            continue
        out[str(row[0])] = int(row[1] or 0)
    return out


def _count_map(sql: str, params: list[Any] | None = None) -> dict[str, int]:
    with turso_client() as client:
        return _count_map_client(client, sql, params)


def _user_liked_songs(sub: str) -> set[str]:
    with turso_client() as client:
        rows = client.execute(
            "SELECT song_id FROM ep_song_likes WHERE logto_sub = ?",
            [sub],
        ).rows
    return {str(r[0]) for r in rows}


def toggle_like(sub: str, song_id: str) -> dict[str, Any]:
    sid = song_or_none(song_id)
    if not sid:
        raise ValueError("未知曲目")
    ensure_schema()
    with turso_client() as client:
        exists = client.execute(
            "SELECT 1 FROM ep_song_likes WHERE logto_sub = ? AND song_id = ?",
            [sub, sid],
        ).rows
        if exists:
            client.execute(
                "DELETE FROM ep_song_likes WHERE logto_sub = ? AND song_id = ?",
                [sub, sid],
            )
            liked = False
        else:
            client.execute(
                "INSERT INTO ep_song_likes (logto_sub, song_id) VALUES (?, ?)",
                [sub, sid],
            )
            liked = True
        n = client.execute(
            "SELECT COUNT(*) FROM ep_song_likes WHERE song_id = ?",
            [sid],
        ).rows[0][0]
    return {"song_id": sid, "liked": liked, "likes": int(n or 0)}


def toggle_heart(sub: str, song_id: str, line_key: str, lyric_text: str) -> dict[str, Any]:
    sid = song_or_none(song_id)
    if not sid:
        raise ValueError("未知曲目")
    key = (line_key or "").strip()[:80]
    text = (lyric_text or "").strip()[:200]
    if not key:
        raise ValueError("缺少歌词行")
    ensure_schema()
    with turso_client() as client:
        exists = client.execute(
            "SELECT 1 FROM ep_lyric_hearts WHERE logto_sub = ? AND song_id = ? AND line_key = ?",
            [sub, sid, key],
        ).rows
        if exists:
            client.execute(
                "DELETE FROM ep_lyric_hearts WHERE logto_sub = ? AND song_id = ? AND line_key = ?",
                [sub, sid, key],
            )
            mine = False
        else:
            client.execute(
                """
                INSERT INTO ep_lyric_hearts (logto_sub, song_id, line_key, lyric_text)
                VALUES (?, ?, ?, ?)
                """,
                [sub, sid, key, text],
            )
            mine = True
        n = client.execute(
            "SELECT COUNT(*) FROM ep_lyric_hearts WHERE song_id = ? AND line_key = ?",
            [sid, key],
        ).rows[0][0]
    return {"song_id": sid, "line_key": key, "mine": mine, "count": int(n or 0)}


def upsert_play(sub: str, song_id: str, session_key: str, max_ratio: float, duration_sec: float | None) -> dict[str, Any]:
    sid = song_or_none(song_id)
    if not sid:
        raise ValueError("未知曲目")
    key = (session_key or "").strip()[:64]
    if not key:
        raise ValueError("缺少播放会话")
    ratio = max(0.0, min(1.0, float(max_ratio)))
    dur = float(duration_sec) if duration_sec else None
    completed = 1 if ratio >= COMPLETE_RATIO else 0
    ensure_schema()
    with turso_client() as client:
        client.execute(
            """
            INSERT INTO ep_play_sessions (logto_sub, song_id, session_key, max_ratio, duration_sec, completed)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(logto_sub, song_id, session_key) DO UPDATE SET
              max_ratio = MAX(ep_play_sessions.max_ratio, excluded.max_ratio),
              duration_sec = COALESCE(excluded.duration_sec, ep_play_sessions.duration_sec),
              completed = CASE WHEN MAX(ep_play_sessions.max_ratio, excluded.max_ratio) >= ? THEN 1 ELSE 0 END,
              updated_at = datetime('now')
            """,
            [sub, sid, key, ratio, dur, completed, COMPLETE_RATIO],
        )
        best = client.execute(
            "SELECT MAX(max_ratio) FROM ep_play_sessions WHERE logto_sub = ? AND song_id = ?",
            [sub, sid],
        ).rows[0][0]
    return {
        "song_id": sid,
        "max_ratio": float(best or 0),
        "completed": float(best or 0) >= COMPLETE_RATIO,
    }


def last_comment_age_sec(sub: str) -> float | None:
    with turso_client() as client:
        rows = client.execute(
            "SELECT (julianday('now') - julianday(created_at)) * 86400 FROM ep_comments WHERE logto_sub = ? ORDER BY id DESC LIMIT 1",
            [sub],
        ).rows
    if not rows or rows[0][0] is None:
        return None
    return float(rows[0][0])


def resolve_guest_nick(guest_display_name: str | None, anonymous: bool) -> tuple[str | None, int]:
    if anonymous:
        return None, 1
    nick = (guest_display_name or "").strip()[:24]
    if not nick:
        nick = DEFAULT_NICK
    return nick, 0


def resolve_comment_author(
    display_name_col: str | None,
    is_anonymous: int | bool,
    user_name: str | None,
    user_email: str | None,
    sub: str,
) -> str:
    if is_anonymous:
        return "匿名"
    if display_name_col and str(display_name_col).strip():
        return str(display_name_col).strip()[:24]
    return display_name(user_name, user_email, sub)


def add_comment(
    sub: str,
    song_id: str | None,
    body: str,
    feeling: str | None,
    rating: int | None,
    guest_display_name: str | None = None,
    anonymous: bool = False,
) -> dict[str, Any]:
    sid = song_or_none(song_id) if song_id else None
    text = (body or "").strip()
    if not text:
        raise ValueError("请写下感受")
    if len(text) > 800:
        raise ValueError("留言请控制在 800 字内")
    feel = (feeling or "").strip() or None
    rate = int(rating) if rating else None
    if rate is not None and rate not in (1, 2, 3, 4, 5):
        rate = None
    nick, anon = resolve_guest_nick(guest_display_name, anonymous)
    ensure_schema()
    age = last_comment_age_sec(sub)
    if age is not None and age < 20:
        raise ValueError("请稍后再留言")
    with turso_client() as client:
        client.execute(
            """
            INSERT INTO ep_comments (logto_sub, song_id, body, feeling, rating, display_name, is_anonymous)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [sub, sid, text, feel, rate, nick, anon],
        )
        row = client.execute(
            "SELECT id, created_at FROM ep_comments WHERE logto_sub = ? ORDER BY id DESC LIMIT 1",
            [sub],
        ).rows[0]
    return {
        "id": int(row[0]),
        "song_id": sid,
        "body": text,
        "feeling": feel,
        "rating": rate,
        "display_name": nick,
        "anonymous": bool(anon),
        "author": "匿名" if anon else (nick or DEFAULT_NICK),
        "created_at": str(row[1]),
    }


def delete_comment(comment_id: int) -> bool:
    ensure_schema()
    with turso_client() as client:
        exists = client.execute("SELECT 1 FROM ep_comments WHERE id = ?", [comment_id]).rows
        if not exists:
            return False
        client.execute("DELETE FROM ep_comments WHERE id = ?", [comment_id])
    return True


def clear_comment_rating(comment_id: int) -> bool:
    ensure_schema()
    with turso_client() as client:
        exists = client.execute("SELECT 1 FROM ep_comments WHERE id = ?", [comment_id]).rows
        if not exists:
            return False
        client.execute("UPDATE ep_comments SET rating = NULL WHERE id = ?", [comment_id])
    return True


def song_hearts(song_id: str, sub: str | None) -> dict[str, dict[str, Any]]:
    sid = song_or_none(song_id)
    if not sid:
        return {}
    mine: set[str] = set()
    with turso_client() as client:
        if sub:
            mine = {
                str(r[0])
                for r in client.execute(
                    "SELECT line_key FROM ep_lyric_hearts WHERE song_id = ? AND logto_sub = ?",
                    [sid, sub],
                ).rows
            }
        rows = client.execute(
            """
            SELECT line_key, MAX(lyric_text), COUNT(*)
            FROM ep_lyric_hearts
            WHERE song_id = ?
            GROUP BY line_key
            """,
            [sid],
        ).rows
    out: dict[str, dict[str, Any]] = {}
    for key, text, n in rows:
        k = str(key)
        out[k] = {"count": int(n or 0), "mine": k in mine, "text": str(text or "")}
    return out


def popular_lyrics(limit: int = 12, song_id: str | None = None) -> list[dict[str, Any]]:
    sid = song_or_none(song_id) if song_id else None
    sql = """
        SELECT song_id, line_key, MAX(lyric_text), COUNT(*) AS n
        FROM ep_lyric_hearts
    """
    params: list[Any] = []
    if sid:
        sql += " WHERE song_id = ?"
        params.append(sid)
    sql += " GROUP BY song_id, line_key HAVING n > 0 ORDER BY n DESC LIMIT ?"
    params.append(limit)
    with turso_client() as client:
        rows = client.execute(sql, params).rows
    titles = {s["id"]: s["title"] for s in SONGS}
    return [
        {
            "song_id": str(r[0]),
            "title": titles.get(str(r[0]), str(r[0])),
            "line_key": str(r[1]),
            "text": str(r[2] or ""),
            "count": int(r[3] or 0),
        }
        for r in rows
    ]


def list_comments(song_id: str | None, limit: int = 40) -> list[dict[str, Any]]:
    sid = song_or_none(song_id) if song_id else None
    sql = """
        SELECT c.id, c.song_id, c.body, c.feeling, c.rating, c.created_at,
               c.logto_sub, u.name, u.email, c.display_name, c.is_anonymous
        FROM ep_comments c
        LEFT JOIN ep_users u ON u.logto_sub = c.logto_sub
    """
    params: list[Any] = []
    if sid:
        sql += " WHERE c.song_id = ?"
        params.append(sid)
    sql += " ORDER BY c.id DESC LIMIT ?"
    params.append(limit)
    titles = {s["id"]: s["title"] for s in SONGS}
    with turso_client() as client:
        rows = client.execute(sql, params).rows
    out = []
    for r in rows:
        out.append(
            {
                "id": int(r[0]),
                "song_id": r[1],
                "title": titles.get(str(r[1]), "整张 EP") if r[1] else "整张 EP",
                "body": str(r[2]),
                "feeling": r[3],
                "rating": int(r[4]) if r[4] is not None else None,
                "created_at": str(r[5]),
                "author": resolve_comment_author(r[9], r[10], r[7], r[8], str(r[6])),
            }
        )
    return out


def last_dev_message_age_sec(sub: str) -> float | None:
    with turso_client() as client:
        rows = client.execute(
            "SELECT (julianday('now') - julianday(created_at)) * 86400 FROM ep_dev_messages WHERE logto_sub = ? ORDER BY id DESC LIMIT 1",
            [sub],
        ).rows
    if not rows or rows[0][0] is None:
        return None
    return float(rows[0][0])


def add_dev_message(
    sub: str,
    body: str,
    guest_display_name: str | None = None,
    anonymous: bool = False,
) -> dict[str, Any]:
    text = (body or "").strip()
    if not text:
        raise ValueError("请写下留言")
    if len(text) > 800:
        raise ValueError("留言请控制在 800 字内")
    nick, anon = resolve_guest_nick(guest_display_name, anonymous)
    ensure_schema()
    age = last_dev_message_age_sec(sub)
    if age is not None and age < 30:
        raise ValueError("请稍后再留言")
    with turso_client() as client:
        client.execute(
            "INSERT INTO ep_dev_messages (logto_sub, body, display_name, is_anonymous) VALUES (?, ?, ?, ?)",
            [sub, text, nick, anon],
        )
        row = client.execute(
            "SELECT id, created_at FROM ep_dev_messages WHERE logto_sub = ? ORDER BY id DESC LIMIT 1",
            [sub],
        ).rows[0]
    return {"id": int(row[0]), "body": text, "created_at": str(row[1]), "author": "匿名" if anon else (nick or DEFAULT_NICK)}


def delete_dev_message(message_id: int) -> bool:
    ensure_schema()
    with turso_client() as client:
        exists = client.execute("SELECT 1 FROM ep_dev_messages WHERE id = ?", [message_id]).rows
        if not exists:
            return False
        client.execute("DELETE FROM ep_dev_messages WHERE id = ?", [message_id])
    return True


def list_dev_messages(limit: int = 50) -> list[dict[str, Any]]:
    with turso_client() as client:
        rows = client.execute(
            """
            SELECT m.id, m.body, m.created_at, m.logto_sub, u.name, u.email, m.display_name, m.is_anonymous
            FROM ep_dev_messages m
            LEFT JOIN ep_users u ON u.logto_sub = m.logto_sub
            ORDER BY m.id DESC
            LIMIT ?
            """,
            [limit],
        ).rows
    return [
        {
            "id": int(r[0]),
            "body": str(r[1]),
            "created_at": str(r[2]),
            "author": resolve_comment_author(r[6], r[7], r[4], r[5], str(r[3])),
        }
        for r in rows
    ]


def board_payload(
    sub: str | None,
    song_id: str | None = None,
    *,
    with_comments: bool = True,
    with_popular: bool = True,
    with_dev_messages: bool = False,
    comments_limit: int = 50,
    dev_messages_limit: int = 50,
) -> dict[str, Any]:
    """一次 Turso 连接拉齐排行与留言，避免多次远程往返。"""
    ensure_schema()
    sid = song_or_none(song_id) if song_id else None
    titles = {s["id"]: s["title"] for s in SONGS}
    with turso_client() as client:
        likes = _count_map_client(client, "SELECT song_id, COUNT(*) FROM ep_song_likes GROUP BY song_id")
        hearts = _count_map_client(client, "SELECT song_id, COUNT(*) FROM ep_lyric_hearts GROUP BY song_id")
        comments_n = _count_map_client(
            client, "SELECT COALESCE(song_id, 'ep'), COUNT(*) FROM ep_comments GROUP BY song_id"
        )
        play_rows = client.execute(
            """
            SELECT song_id,
                   COUNT(DISTINCT logto_sub) AS listeners,
                   SUM(CASE WHEN max_ratio >= ? THEN 1 ELSE 0 END) AS completes,
                   AVG(max_ratio) AS avg_ratio
            FROM ep_play_sessions
            GROUP BY song_id
            """,
            [COMPLETE_RATIO],
        ).rows
        liked: set[str] = set()
        if sub:
            liked = {
                str(r[0])
                for r in client.execute(
                    "SELECT song_id FROM ep_song_likes WHERE logto_sub = ?",
                    [sub],
                ).rows
            }
        popular: list[dict[str, Any]] = []
        if with_popular:
            sql = """
                SELECT song_id, line_key, MAX(lyric_text), COUNT(*) AS n
                FROM ep_lyric_hearts
            """
            params: list[Any] = []
            if sid:
                sql += " WHERE song_id = ?"
                params.append(sid)
            sql += " GROUP BY song_id, line_key HAVING n > 0 ORDER BY n DESC LIMIT ?"
            params.append(12)
            popular = [
                {
                    "song_id": str(r[0]),
                    "title": titles.get(str(r[0]), str(r[0])),
                    "line_key": str(r[1]),
                    "text": str(r[2] or ""),
                    "count": int(r[3] or 0),
                }
                for r in client.execute(sql, params).rows
            ]
        comments: list[dict[str, Any]] = []
        if with_comments:
            csql = """
                SELECT c.id, c.song_id, c.body, c.feeling, c.rating, c.created_at,
                       c.logto_sub, u.name, u.email, c.display_name, c.is_anonymous
                FROM ep_comments c
                LEFT JOIN ep_users u ON u.logto_sub = c.logto_sub
            """
            cparams: list[Any] = []
            if sid:
                csql += " WHERE c.song_id = ?"
                cparams.append(sid)
            csql += " ORDER BY c.id DESC LIMIT ?"
            cparams.append(comments_limit)
            comments = [
                {
                    "id": int(r[0]),
                    "song_id": r[1],
                    "title": titles.get(str(r[1]), "整张 EP") if r[1] else "整张 EP",
                    "body": str(r[2]),
                    "feeling": r[3],
                    "rating": int(r[4]) if r[4] is not None else None,
                    "created_at": str(r[5]),
                    "author": resolve_comment_author(r[9], r[10], r[7], r[8], str(r[6])),
                }
                for r in client.execute(csql, cparams).rows
            ]
        dev_messages: list[dict[str, Any]] = []
        if with_dev_messages:
            dev_messages = [
                {
                    "id": int(r[0]),
                    "body": str(r[1]),
                    "created_at": str(r[2]),
                    "author": resolve_comment_author(r[6], r[7], r[4], r[5], str(r[3])),
                }
                for r in client.execute(
                    """
                    SELECT m.id, m.body, m.created_at, m.logto_sub, u.name, u.email, m.display_name, m.is_anonymous
                    FROM ep_dev_messages m
                    LEFT JOIN ep_users u ON u.logto_sub = m.logto_sub
                    ORDER BY m.id DESC
                    LIMIT ?
                    """,
                    [dev_messages_limit],
                ).rows
            ]
        hearts_map: dict[str, dict[str, Any]] = {}
        if sid:
            mine_keys: set[str] = set()
            if sub:
                mine_keys = {
                    str(r[0])
                    for r in client.execute(
                        "SELECT line_key FROM ep_lyric_hearts WHERE song_id = ? AND logto_sub = ?",
                        [sid, sub],
                    ).rows
                }
            for key, text, n in client.execute(
                """
                SELECT line_key, MAX(lyric_text), COUNT(*)
                FROM ep_lyric_hearts
                WHERE song_id = ?
                GROUP BY line_key
                """,
                [sid],
            ).rows:
                k = str(key)
                hearts_map[k] = {"count": int(n or 0), "mine": k in mine_keys, "text": str(text or "")}
    play = {
        str(r[0]): {"listeners": int(r[1] or 0), "completes": int(r[2] or 0), "avg_ratio": float(r[3] or 0)}
        for r in play_rows
    }
    songs_out = []
    for meta in SONGS:
        i = meta["id"]
        listeners = play.get(i, {}).get("listeners", 0)
        completes = play.get(i, {}).get("completes", 0)
        avg_ratio = play.get(i, {}).get("avg_ratio", 0.0)
        rate = min(1.0, avg_ratio) if avg_ratio else 0.0
        songs_out.append(
            {
                **meta,
                "likes": likes.get(i, 0),
                "liked": i in liked,
                "hearts": hearts.get(i, 0),
                "comments": comments_n.get(i, 0),
                "listeners": listeners,
                "completes": completes,
                "completion_rate": round(rate, 4),
                "avg_ratio": round(avg_ratio, 4),
            }
        )
    ranked = sorted(
        songs_out,
        key=lambda s: (s["likes"], s["completes"], s["hearts"], s["avg_ratio"]),
        reverse=True,
    )
    for i, item in enumerate(ranked, 1):
        item["rank"] = i
    rank_map = {s["id"]: s["rank"] for s in ranked}
    for item in songs_out:
        item["rank"] = rank_map[item["id"]]
    payload: dict[str, Any] = {
        "db": True,
        "backend": "turso" if using_turso() else "sqlite",
        "songs": songs_out,
        "ranking": ranked,
        "popular_lyrics": popular,
        "comments": comments,
        "album_comments": comments_n.get("ep", 0),
        "complete_ratio": COMPLETE_RATIO,
    }
    if sid:
        payload["song_id"] = sid
        payload["hearts_map"] = hearts_map
    if with_dev_messages:
        payload["dev_messages"] = dev_messages
    return payload
