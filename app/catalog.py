# -*- coding: utf-8 -*-
"""《沉浮》四曲目录（留言仓 / 点赞 / 完播共用）。"""
from __future__ import annotations

SONGS: tuple[dict[str, str], ...] = (
    {
        "id": "bait",
        "title": "饵",
        "en": "Bait",
        "num": "01",
        "player": "/《饵》/饵_ep/player.html",
        "pitch": "纯粹与占有。戏谑来时，用不回应握住主动权。",
    },
    {
        "id": "shark",
        "title": "鲨鱼",
        "en": "Shark",
        "num": "02",
        "player": "/《鲨鱼》/鲨鱼_EP_5.1/player.html",
        "pitch": "明知鱼鳍即危险，仍一步步进。再浮向晨光。",
    },
    {
        "id": "sub",
        "title": "潜水艇",
        "en": "Submarine",
        "num": "03",
        "player": "/《潜水艇》/潜水艇_ep/player.html",
        "pitch": "隔着潜望镜想上岸。岛屿忽远又忽近。",
    },
    {
        "id": "volcano",
        "title": "火山群岛",
        "en": "Volcanic Archipelago",
        "num": "04",
        "player": "/《火山群岛》/火山群岛_ep/player.html",
        "pitch": "反传统叙事的人。听不懂就算了——正好。",
    },
)

SONG_IDS = {s["id"] for s in SONGS}
FEELINGS = ("沉", "刺", "暖", "空", "燃", "谜")
COMPLETE_RATIO = 0.90

# 写给开发者 · 公告栏轮播图（专辑封面）
CAROUSEL_IMAGES: tuple[dict[str, str], ...] = (
    {"src": "/assets/hub/hero_ep.png", "title": "《沉浮》", "caption": "Float & Sink — 四曲 EP"},
    {"src": "/assets/hub/03_bait.jpg", "title": "饵", "caption": "纯粹与占有"},
    {"src": "/assets/hub/02_shark.jpg", "title": "鲨鱼", "caption": "明知鱼鳍即危险"},
    {"src": "/assets/hub/01_submarine.jpg", "title": "潜水艇", "caption": "隔着潜望镜想上岸"},
    {"src": "/assets/hub/04_volcano.jpg", "title": "火山群岛", "caption": "听不懂就算了——正好"},
)

DEV_ANNOUNCEMENTS: tuple[str, ...] = (
    "留言仓已开放：完播、点赞、歌词爱心与看法都会汇在这里。",
    "播放页句子右侧可标♡；听完可在下方写入留言仓。",
    "写给开发者：Bug、建议、合作意向都欢迎，会定期查看。",
)


def song_or_none(song_id: str | None) -> str | None:
    if not song_id:
        return None
    sid = song_id.strip().lower()
    aliases = {
        "饵": "bait",
        "鲨鱼": "shark",
        "潜水艇": "sub",
        "火山群岛": "volcano",
        "submarine": "sub",
        "volcanic": "volcano",
        "ep": None,
        "all": None,
    }
    if sid in aliases:
        return aliases[sid]
    if sid in SONG_IDS:
        return sid
    return None


DEFAULT_NICK = "匿名泡泡"


def display_name(name: str | None, email: str | None, sub: str) -> str:
    if name and name.strip():
        return name.strip()[:24]
    if email and "@" in email:
        return email.split("@", 1)[0][:18]
    if sub.startswith("guest-"):
        return "访客"
    return "听友"
