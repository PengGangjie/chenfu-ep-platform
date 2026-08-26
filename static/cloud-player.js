(function () {
  var SONGS = [
    { id: "bait", test: /饵/ },
    { id: "shark", test: /鲨鱼/ },
    { id: "sub", test: /潜水艇/ },
    { id: "volcano", test: /火山群岛/ }
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

  var sessionKey =
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  var maxRatio = 0;
  var lastFlush = 0;
  var hearts = {};
  var canWrite = true;

  function api(path, body) {
    if (window.chenfuApi) return window.chenfuApi(path, body);
    var opt = { credentials: "same-origin", headers: { Accept: "application/json" } };
    if (body) {
      opt.method = "POST";
      opt.headers["Content-Type"] = "application/json";
      opt.body = JSON.stringify(body);
    }
    return fetch(path, opt).then(function (r) {
      return r.json().then(function (j) {
        j._status = r.status;
        return j;
      });
    });
  }

  function fmtPct(n) {
    return Math.round((n || 0) * 100) + "%";
  }

  function ensureBar() {
    if (document.querySelector(".cloud-song-bar")) return document.querySelector(".cloud-song-bar");
    var h1 = document.querySelector(".player-panel .headline, .headline");
    if (!h1) return null;
    var bar = document.createElement("div");
    bar.className = "cloud-song-bar";
    bar.innerHTML =
      '<button type="button" class="cloud-like" id="cloudLike"><span class="heart">♡</span><span class="lab">喜欢这首</span></button>' +
      '<span class="cloud-song-meta" id="cloudSongMeta"></span>' +
      '<a href="/board.html?song=' +
      encodeURIComponent(songId) +
      '">留言仓 ›</a>';
    h1.insertAdjacentElement("afterend", bar);
    bar.querySelector("#cloudLike").addEventListener("click", function () {
      api("/api/ep/like", { song_id: songId })
        .then(function (j) {
          if (j._status >= 400) return;
          paintLike(j.likes, j.liked);
        })
        .catch(function () {});
    });
    return bar;
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
      "完播率 " +
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
    document.querySelectorAll(".lyric-line").forEach(function (el) {
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
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        api("/api/ep/heart", {
          song_id: songId,
          line_key: key,
          lyric_text: lineText(el)
        }).then(function (j) {
          if (j._status >= 400) return;
          hearts[key] = { count: j.count, mine: j.mine, text: lineText(el) };
          paintHeart(btn, hearts[key]);
        });
      });
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
      '<input type="text" id="cloudNoteNick" maxlength="24" placeholder="署名（可选）" value="' +
      savedNick.replace(/"/g, "&quot;") +
      '"/>' +
      '<label class="anon-check"><input type="checkbox" id="cloudNoteAnon"/> 匿名发布</label></div>' +
      '<textarea id="cloudNoteBody" maxlength="800" placeholder="某句歌词、或想留给下一位听友的话"></textarea>' +
      '<div class="row">' +
      flowerHtml("cloudNoteFlower") +
      '<span class="rate-label">评分</span>' +
      starsHtml("cloudNoteRate") +
      '<button type="button" class="primary" id="cloudNoteSend">写入留言仓</button>' +
      "</div>" +
      '<p class="hint" id="cloudNoteHint">访客也会记入完播与排名。爱心点在歌词行右侧。</p>';
    root.insertAdjacentElement("afterend", box);
    bindStars("cloudNoteRate");
    bindFlower("cloudNoteFlower", songId);
    document.getElementById("cloudNoteSend").addEventListener("click", function () {
      var body = (document.getElementById("cloudNoteBody").value || "").trim();
      if (!body) {
        document.getElementById("cloudNoteHint").textContent = "先写一句再送进留言仓。";
        return;
      }
      var anon = document.getElementById("cloudNoteAnon").checked;
      var nick = (document.getElementById("cloudNoteNick").value || "").trim();
      if (!anon && nick) localStorage.setItem("chenfu_nick", nick);
      api("/api/ep/comment", {
        song_id: songId,
        body: body,
        rating: getRating("cloudNoteRate"),
        display_name: anon ? null : nick || null,
        anonymous: anon
      }).then(function (j) {
        if (j.detail && j._status >= 400) {
          document.getElementById("cloudNoteHint").textContent = j.detail;
          return;
        }
        document.getElementById("cloudNoteBody").value = "";
        paintStars(document.getElementById("cloudNoteRate"), 0);
        document.getElementById("cloudNoteHint").textContent = "已写入留言仓。";
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
    a.textContent = "留言仓";
    dock.appendChild(a);
  }

  function loadSocial() {
    api("/api/board?song=" + encodeURIComponent(songId)).then(function (j) {
      if (!j || !j.songs) return;
      canWrite = !(j.me && j.me.auth_required && !j.me.authenticated && j.me.auth_configured);
      var song = null;
      (j.songs || []).forEach(function (s) {
        if (s.id === songId) song = s;
      });
      ensureBar();
      if (song) {
        paintLike(song.likes, song.liked);
        paintMeta(song);
        paintFlower(document.getElementById("cloudNoteFlower"), song.likes, song.liked);
      }
      hearts = j.hearts_map || {};
      decorateLines();
    });
  }

  function currentRatio(audio) {
    if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return 0;
    return Math.max(0, Math.min(1, audio.currentTime / audio.duration));
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
    api("/api/ep/play", {
      song_id: songId,
      session_key: sessionKey,
      max_ratio: maxRatio,
      duration_sec: isFinite(audio.duration) ? audio.duration : null
    }).catch(function () {});
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

  var lyrics = document.getElementById("syncLyrics");
  if (lyrics && window.MutationObserver) {
    var mo = new MutationObserver(function () {
      decorateLines();
      Object.keys(hearts).forEach(function (k) {
        var btn = document.querySelector('.lyric-heart[data-line-key="' + k + '"]');
        if (btn) paintHeart(btn, hearts[k]);
      });
    });
    mo.observe(lyrics, { childList: true, subtree: false });
  }

  ensureBar();
  ensureComposer();
  injectDock();
  decorateLines();
  loadSocial();
  watchAudio();
})();
