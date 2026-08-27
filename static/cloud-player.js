(function () {
  var SONGS = [
    { id: "bait", test: /饵/, player: "/《饵》/饵_ep/player.html" },
    { id: "shark", test: /鲨鱼/, player: "/《鲨鱼》/鲨鱼_EP_5.1/player.html" },
    { id: "sub", test: /潜水艇/, player: "/《潜水艇》/潜水艇_ep/player.html" },
    { id: "volcano", test: /火山群岛/, player: "/《火山群岛》/火山群岛_ep/player.html" }
  ];

  function songIdFromPath() {
    var p = decodeURIComponent(location.pathname || "");
    for (var i = 0; i < SONGS.length; i++) {
      if (SONGS[i].test.test(p)) return SONGS[i].id;
    }
    return "";
  }

  var songId = songIdFromPath();
  if (!songId || !document.querySelector(".player-page, #syncLyrics, #audio")) return;

  document.documentElement.classList.add("player-immersive");
  if (window.matchMedia("(max-width: 860px)").matches) {
    document.body.classList.add("player-immersive-mobile");
  }

  var sessionKey =
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  var maxRatio = 0;
  var lastFlush = 0;
  var hearts = {};
  var loopOne = false;
  var shuffleMode = sessionStorage.getItem("chenfu_shuffle") === "1";
  var lastHeartTap = 0;
  var decorateScheduled = false;

  function newSessionKey() {
    return (
      (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now()) + "-" + Math.random().toString(16).slice(2)
    );
  }

  function resetPlaySession() {
    sessionKey = newSessionKey();
    maxRatio = 0;
    lastFlush = 0;
  }

  function guestKey() {
    if (window.chenfuGuestKey) return window.chenfuGuestKey();
    var k = localStorage.getItem("chenfu_guest");
    if (k && /^guest-[a-f0-9]{12}$/.test(k)) return k;
    var raw =
      (window.crypto && crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) ||
      Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
    k = "guest-" + raw.slice(0, 12);
    localStorage.setItem("chenfu_guest", k);
    return k;
  }

  function api(path, body) {
    if (window.chenfuApi) return window.chenfuApi(path, body);
    var gk = guestKey();
    var opt = { credentials: "same-origin", headers: { Accept: "application/json" } };
    if (body) {
      opt.method = "POST";
      opt.headers["Content-Type"] = "application/json";
      body = Object.assign({}, body, { guest_key: gk });
      opt.body = JSON.stringify(body);
    } else if (path.indexOf("?") >= 0) {
      path += "&guest_key=" + encodeURIComponent(gk);
    } else {
      path += "?guest_key=" + encodeURIComponent(gk);
    }
    return fetch(path, opt).then(function (r) {
      return r.json().then(function (j) {
        j._status = r.status;
        return j;
      });
    });
  }

  function applyHeartsToDom() {
    Object.keys(hearts).forEach(function (k) {
      var btn = document.querySelector('.lyric-heart[data-line-key="' + k + '"]');
      if (btn) paintHeart(btn, hearts[k]);
    });
  }

  function postHeart(key, lineEl, prev, btn) {
    var payload = {
      song_id: songId,
      line_key: key,
      lyric_text: lineText(lineEl),
      guest_key: guestKey()
    };
    fetch("/api/ep/heart", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    })
      .then(function (r) {
        return r.json().then(function (j) {
          j._status = r.status;
          return j;
        });
      })
      .then(function (j) {
        if (j._status >= 400 || j.detail) {
          hearts[key] = prev;
          paintHeart(btn, prev);
          return;
        }
        hearts[key] = { count: j.count, mine: j.mine, text: lineText(lineEl) };
        paintHeart(btn, hearts[key]);
      })
      .catch(function () {});
  }

  function toggleHeartOptimistic(key, btn, lineEl) {
    var prev = hearts[key] ? Object.assign({}, hearts[key]) : { count: 0, mine: false, text: lineText(lineEl) };
    var nextMine = !prev.mine;
    var nextCount = Math.max(0, (prev.count || 0) + (nextMine ? 1 : -1));
    hearts[key] = { count: nextCount, mine: nextMine, text: lineText(lineEl) };
    paintHeart(btn, hearts[key]);
    postHeart(key, lineEl, prev, btn);
  }

  function bindHeartDelegation() {
    var root = document.getElementById("syncLyrics");
    if (!root || root.dataset.heartBound) return;
    root.dataset.heartBound = "1";
    function onHeart(ev) {
      var btn = ev.target.closest(".lyric-heart");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      var now = Date.now();
      if (now - lastHeartTap < 320) return;
      lastHeartTap = now;
      var key = btn.getAttribute("data-line-key");
      var row = btn.closest(".lyric-row");
      var lineEl = row && row.querySelector(".lyric-line, .sync-line");
      if (!key || !lineEl) return;
      toggleHeartOptimistic(key, btn, lineEl);
    }
    root.addEventListener("click", onHeart, true);
  }

  function scheduleDecorate() {
    if (decorateScheduled) return;
    decorateScheduled = true;
    requestAnimationFrame(function () {
      decorateScheduled = false;
      decorateLines();
      applyHeartsToDom();
    });
  }

  window.chenfuOnLyricsRendered = scheduleDecorate;

  function deferIdle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 2500 });
    else setTimeout(fn, 16);
  }

  function songIndex(id) {
    for (var i = 0; i < SONGS.length; i++) {
      if (SONGS[i].id === id) return i;
    }
    return -1;
  }

  function goToPlayer(url) {
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    location.assign(url + sep + "autoplay=1");
  }

  function playNextTrack() {
    var idx = songIndex(songId);
    if (idx < 0) return;
    var target;
    if (shuffleMode) {
      if (SONGS.length <= 1) return;
      var pick;
      do {
        pick = Math.floor(Math.random() * SONGS.length);
      } while (pick === idx);
      target = SONGS[pick];
    } else {
      target = SONGS[(idx + 1) % SONGS.length];
    }
    if (target && target.player) goToPlayer(target.player);
  }

  function tryAutoplayFromQuery() {
    try {
      if (!new URLSearchParams(location.search).get("autoplay")) return;
    } catch (e) {
      return;
    }
    var audio = document.getElementById("audio");
    if (!audio) return;
    function start() {
      audio.play().catch(function () {});
    }
    if (audio.readyState >= 2) start();
    else audio.addEventListener("canplay", start, { once: true });
  }

  function setLoop(on) {
    loopOne = on;
    var btn = document.getElementById("btnLoop");
    if (!btn) return;
    btn.classList.toggle("is-on", loopOne);
    btn.setAttribute("aria-pressed", loopOne ? "true" : "false");
    btn.textContent = loopOne ? "循环中" : "单曲循环";
  }

  function setShuffle(on) {
    shuffleMode = on;
    sessionStorage.setItem("chenfu_shuffle", on ? "1" : "0");
    var btn = document.getElementById("btnShuffle");
    if (!btn) return;
    btn.classList.toggle("is-on", shuffleMode);
    btn.setAttribute("aria-pressed", shuffleMode ? "true" : "false");
    btn.textContent = shuffleMode ? "随机中" : "随机播放";
  }

    return Math.round((n || 0) * 100) + "%";
  }

  function ensureBar() {
    var row = document.querySelector(".transport .row");
    if (!row) return null;

    var oldBar = document.querySelector(".cloud-song-bar");
    if (oldBar) oldBar.remove();

    var like = document.getElementById("cloudLike");
    if (!like) {
      like = document.createElement("button");
      like.type = "button";
      like.className = "cloud-like ghost";
      like.id = "cloudLike";
      like.innerHTML = '<span class="heart">♡</span><span class="lab">喜欢这首</span>';
      like.addEventListener("click", function () {
        api("/api/ep/like", { song_id: songId })
          .then(function (j) {
            if (j._status >= 400) return;
            paintLike(j.likes, j.liked);
          })
          .catch(function () {});
      });
    }
    if (like.parentNode !== row) {
      var loop = document.getElementById("btnLoop");
      var shuffle = document.getElementById("btnShuffle");
      var anchor = shuffle || loop;
      if (anchor && anchor.parentNode === row) anchor.insertAdjacentElement("afterend", like);
      else row.appendChild(like);
    }

    var meta = document.getElementById("cloudSongMeta");
    if (!meta) {
      meta = document.createElement("span");
      meta.className = "cloud-song-meta";
      meta.id = "cloudSongMeta";
    }
    var transport = document.querySelector(".transport");
    if (transport && meta.parentNode !== transport) {
      row.insertAdjacentElement("afterend", meta);
    }

    return like;
  }

  function paintLike(likes, liked) {
    var btn = document.getElementById("cloudLike");
    if (!btn) return;
    btn.classList.toggle("is-on", !!liked);
    btn.querySelector(".heart").textContent = liked ? "♥" : "♡";
    btn.querySelector(".lab").textContent = "喜欢这首 · " + (likes || 0);
  }

  function paintMeta(song) {
    var el = document.getElementById("cloudSongMeta");
    if (!el || !song) return;
    el.textContent =
      "完播 " +
      (song.completes || 0) +
      " 次 · 深度 " +
      fmtPct(song.completion_rate) +
      " · 排名第 " +
      (song.rank || "—") +
      " · 爱心 " +
      (song.hearts || 0);
  }

  function lineKey(el) {
    return String(el.getAttribute("data-bi") || "0") + ":" + String(el.getAttribute("data-li") || "0");
  }

  function lineText(el) {
    var t = el.querySelector(".lyric-text");
    return ((t && t.textContent) || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 200);
  }

  function paintHeart(btn, info) {
    var n = (info && info.count) || 0;
    var mine = !!(info && info.mine);
    btn.classList.toggle("is-on", mine);
    btn.querySelector(".glyph").textContent = mine ? "♥" : "♡";
    btn.querySelector(".n").textContent = n ? String(n) : "";
    btn.setAttribute("aria-pressed", mine ? "true" : "false");
    btn.title = mine ? "取消喜欢这句" : "喜欢这句歌词";
  }

  function decorateLines() {
    var root = document.getElementById("syncLyrics");
    if (!root) return;
    root.querySelectorAll(".lyric-line, .sync-line").forEach(function (el) {
      if (el.closest(".lyric-row")) return;
      var wrap = document.createElement("div");
      wrap.className = "lyric-row";
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      var key = lineKey(el);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lyric-heart";
      btn.setAttribute("data-line-key", key);
      btn.innerHTML = '<span class="glyph">♡</span><span class="n"></span>';
      paintHeart(btn, hearts[key]);
      wrap.appendChild(btn);
    });
  }

  function starsHtml(id) {
    return (
      '<div class="rate-stars" id="' +
      id +
      '" data-value="0" role="radiogroup" aria-label="评分">' +
      [1, 2, 3, 4, 5]
        .map(function (n) {
          return (
            '<button type="button" class="rate-star" data-v="' +
            n +
            '" aria-label="' +
            n +
            '星">☆</button>'
          );
        })
        .join("") +
      "</div>"
    );
  }

  function paintStars(el, value) {
    if (!el) return;
    el.setAttribute("data-value", String(value || 0));
    el.querySelectorAll(".rate-star").forEach(function (btn) {
      var v = Number(btn.getAttribute("data-v"));
      var on = v <= value;
      btn.classList.toggle("is-on", on);
      btn.textContent = on ? "★" : "☆";
    });
  }

  function bindStars(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.querySelectorAll(".rate-star").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = Number(btn.getAttribute("data-v"));
        var cur = Number(el.getAttribute("data-value") || 0);
        paintStars(el, cur === v ? 0 : v);
      });
    });
  }

  function getRating(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var v = Number(el.getAttribute("data-value") || 0);
    return v > 0 ? v : null;
  }

  function flowerHtml(id) {
    return (
      '<button type="button" class="flower-btn" id="' +
      id +
      '" aria-pressed="false" title="送花（计入点赞）">' +
      '<span class="glyph">🌸</span><span class="lab">送花</span><span class="n"></span></button>'
    );
  }

  function paintFlower(btn, likes, liked) {
    if (!btn) return;
    btn.classList.toggle("is-on", !!liked);
    btn.setAttribute("aria-pressed", liked ? "true" : "false");
    var n = btn.querySelector(".n");
    if (n) n.textContent = likes > 0 ? " · " + likes : "";
    btn.querySelector(".lab").textContent = liked ? "已送花" : "送花";
  }

  function bindFlower(btnId, sid) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener("click", function () {
      api("/api/ep/like", { song_id: sid }).then(function (j) {
        if (j._status >= 400) return;
        paintFlower(btn, j.likes, j.liked);
      });
    });
  }

  function ensureComposer() {
    if (document.getElementById("cloudNote")) return;
    var root = document.getElementById("syncLyrics") || document.querySelector(".player-panel");
    if (!root) return;
    var box = document.createElement("div");
    box.className = "cloud-player-note";
    box.id = "cloudNote";
    var savedNick = localStorage.getItem("chenfu_nick") || "";
    box.innerHTML =
      "<label>听完想说</label>" +
      '<div class="compose-nick">' +
      '<input type="text" id="cloudNoteNick" maxlength="24" placeholder="署名（可选，留空则为匿名泡泡）" value="' +
      savedNick.replace(/"/g, "&quot;") +
      '"/></div>' +
      '<textarea id="cloudNoteBody" maxlength="800" placeholder="某句歌词、或想留给下一位听友的话"></textarea>' +
      '<div class="row">' +
      flowerHtml("cloudNoteFlower") +
      '<span class="rate-label">评分</span>' +
      starsHtml("cloudNoteRate") +
      '<button type="button" class="primary" id="cloudNoteSend">写入留言板</button>' +
      "</div>" +
      '<p class="hint" id="cloudNoteHint">访客也会记入完播与排名。爱心点在歌词行右侧。</p>';
    root.insertAdjacentElement("afterend", box);
    bindStars("cloudNoteRate");
    bindFlower("cloudNoteFlower", songId);
    document.getElementById("cloudNoteSend").addEventListener("click", function () {
      var body = (document.getElementById("cloudNoteBody").value || "").trim();
      if (!body) {
        document.getElementById("cloudNoteHint").textContent = "先写一句再送进留言板。";
        return;
      }
      var nick = (document.getElementById("cloudNoteNick").value || "").trim();
      if (nick) localStorage.setItem("chenfu_nick", nick);
      api("/api/ep/comment", {
        song_id: songId,
        body: body,
        rating: getRating("cloudNoteRate"),
        display_name: nick || "匿名泡泡",
        anonymous: false
      }).then(function (j) {
        if (j.detail && j._status >= 400) {
          document.getElementById("cloudNoteHint").textContent = j.detail;
          return;
        }
        document.getElementById("cloudNoteBody").value = "";
        paintStars(document.getElementById("cloudNoteRate"), 0);
        document.getElementById("cloudNoteHint").textContent = "已写入留言板。";
      });
    });
  }

  function injectDock() {
    var dock = document.querySelector(".floating-dock");
    if (!dock || dock.querySelector("[data-cloud-board]")) return;
    var a = document.createElement("a");
    a.className = "shark-seg__item";
    a.setAttribute("data-cloud-board", "1");
    a.href = "/board.html?song=" + encodeURIComponent(songId);
    a.textContent = "留言板";
    dock.appendChild(a);
  }

  function loadSocial() {
    api("/api/ep/player?song=" + encodeURIComponent(songId)).then(function (j) {
      if (!j || !j.song) return;
      var song = j.song;
      ensureBar();
      paintLike(song.likes, song.liked);
      paintMeta(song);
      paintFlower(document.getElementById("cloudNoteFlower"), song.likes, song.liked);
      hearts = j.hearts_map || {};
      applyHeartsToDom();
    });
  }

  function currentRatio(audio) {
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return 0;
    return Math.max(0, Math.min(1, audio.currentTime / audio.duration));
  }

  function ensureLoopBtn() {
    var btn = document.getElementById("btnLoop");
    if (!btn) {
      var row = document.querySelector(".transport .row");
      if (!row) return;
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ghost";
      btn.id = "btnLoop";
      btn.textContent = "单曲循环";
      var play = document.getElementById("btnPlay");
      if (play && play.parentNode === row) play.insertAdjacentElement("afterend", btn);
      else row.appendChild(btn);
    }
    if (btn.dataset.loopBound) return;
    btn.dataset.loopBound = "1";
    btn.setAttribute("aria-pressed", "false");
    btn.title = "循环播放；每次完整播完计入单曲数据";
    btn.addEventListener("click", function () {
      var next = !loopOne;
      if (next) setShuffle(false);
      setLoop(next);
    });
  }

  function ensureShuffleBtn() {
    var btn = document.getElementById("btnShuffle");
    if (!btn) {
      var row = document.querySelector(".transport .row");
      if (!row) return;
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ghost";
      btn.id = "btnShuffle";
      btn.textContent = "随机播放";
      var loop = document.getElementById("btnLoop");
      if (loop && loop.parentNode === row) loop.insertAdjacentElement("afterend", btn);
      else row.appendChild(btn);
    }
    if (btn.dataset.shuffleBound) return;
    btn.dataset.shuffleBound = "1";
    btn.setAttribute("aria-pressed", shuffleMode ? "true" : "false");
    btn.title = "播完后随机切歌；与单曲循环互斥";
    btn.classList.toggle("is-on", shuffleMode);
    btn.textContent = shuffleMode ? "随机中" : "随机播放";
    btn.addEventListener("click", function () {
      var next = !shuffleMode;
      if (next) setLoop(false);
      setShuffle(next);
    });
  }

  function flushPlay(force) {
    var audio = document.getElementById("audio");
    if (!audio) return;
    var r = Math.max(maxRatio, currentRatio(audio));
    if (audio.ended) r = 1;
    maxRatio = r;
    var now = Date.now();
    if (!force && now - lastFlush < 12000 && r < 0.9) return;
    lastFlush = now;
    var payload = JSON.stringify({
      song_id: songId,
      session_key: sessionKey,
      max_ratio: maxRatio,
      duration_sec: isFinite(audio.duration) ? audio.duration : null,
      guest_key: guestKey()
    });
    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon(
          "/api/ep/play",
          new Blob([payload], { type: "application/json" })
        );
        return;
      } catch (e) {}
    }
    fetch("/api/ep/play", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: payload,
      keepalive: true
    }).catch(function () {});
  }

  function patchAudio() {
    var audio = document.getElementById("audio");
    if (!audio || audio.dataset.cloudPatched) return;
    audio.dataset.cloudPatched = "1";
    if (!audio.getAttribute("preload")) audio.setAttribute("preload", "auto");
    audio.addEventListener("error", function () {
      var hint = document.getElementById("audioHint");
      if (hint) hint.textContent = "音频加载失败，请刷新页面或检查网络。";
    });
  }

  function watchAudio() {
    var audio = document.getElementById("audio");
    if (!audio) return;
    audio.addEventListener("timeupdate", function () {
      maxRatio = Math.max(maxRatio, currentRatio(audio));
    });
    audio.addEventListener("ended", function () {
      maxRatio = 1;
      flushPlay(true);
      if (loopOne) {
        resetPlaySession();
        audio.currentTime = 0;
        audio.play().catch(function () {});
        return;
      }
      playNextTrack();
    });
    audio.addEventListener("pause", function () {
      flushPlay(true);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) flushPlay(true);
    });
    window.addEventListener("pagehide", function () {
      flushPlay(true);
    });
    setInterval(function () {
      if (audio && !audio.paused) flushPlay(false);
    }, 15000);
  }

  bindHeartDelegation();
  patchAudio();
  ensureBar();
  ensureLoopBtn();
  ensureShuffleBtn();
  injectDock();
  scheduleDecorate();
  watchAudio();
  tryAutoplayFromQuery();
  deferIdle(function () {
    loadSocial();
    ensureComposer();
  });
})();
