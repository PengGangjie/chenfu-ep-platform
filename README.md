# 《沉浮》EP（网页门户 + 登录听歌）

独立项目，与实训科 / 人生量化**分开部署**：

| | 《沉浮》EP | 人生量化 | 实训科 |
|--|-----------|----------|--------|
| Space | `chenfu-ep` | `life-density` | `gxstzy-shixun` |
| 凭证 | `secrets/chenfu-ep/` | `secrets/life-density/` | `secrets/shixun-platform/` |
| Logto | **新建** `chenfu-ep` | life-density | gxstzy-shixun-platform |

## 访问策略

- **公开**：EP 主页（叙事弧、曲目封面）、[留言仓](https://chenfu-ep.ai-builders.space/board.html)（完播排名、热门歌词、听友评价）
- **登录后**：四曲播放页、歌词卡、音频主轨；点赞 / 歌词爱心 / 完播记录 / 留言

本地未配 Logto 时（`AUTH_REQUIRED=false`）可用会话访客写入留言仓，数据落 `data/ep.db`。云端有 Turso 则写入 Turso。

云端包为轻量同步：各曲默认主轨 A/B + 歌词卡图 + 门户静帧（不含整包 1GB+ 工程与氛围 mp4）。

## 本地

```powershell
cd c:\00CS\text
.\venv\Scripts\python.exe scripts\sync_chenfu_ep_static.py
cd output\chenfu-ep-platform
..\..\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8020
```

未配置 Logto 时本地可直接听；配置后 `AUTH_REQUIRED=true` 才强制登录。

## 部署

1. 按 `secrets/chenfu-ep/README.md` 新建 Logto 应用，写入 `.env`
2. 公开仓 `main` 推送到 GitHub（见 `deploy-config.json`）
3. `.\venv\Scripts\python.exe scripts\deploy_chenfu_ep_space.py`

线上：https://chenfu-ep.ai-builders.space
