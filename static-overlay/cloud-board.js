(function () {
  var params = new URLSearchParams(location.search);
  var song = params.get("song") || "";
  var root = document.getElementById("boardApp");
  if (!root) return;

  function api(path, body) {
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

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pct(n) {
    return Math.round((Number(n) || 0) * 100) + "%";
  }

  function setSong(id) {
    song = id || "";
    var u = new URL(location.href);
    if (song) u.searchParams.set("song", song);
    else u.searchParams.delete("song");
    history.replaceState({}, "", u);
    load();
  }

  function navHtml(songs) {
    var items = [{ id: "", title: "总览" }].concat(songs || []);
    return (
      '<p class="eyebrow">导航仓</p>' +
      items
        .map(function (s) {
          var on = (s.id || "") === (song || "") ? " is-on" : "";
          var rank = s.num ? '<span class="rank-dot">' + s.num + "</span>" : "";
          return (
            '<a href="#" data-song="' +
            esc(s.id || "") +
            '" class="' +
            on.trim() +
            '">' +
            rank +
            esc(s.title) +
            "</a>"
          );
        })
        .join("")
    );
  }

  function rankCards(ranking) {
    return (
      '<div class="rank-grid">' +
      ranking
        .map(function (s) {
          return (
            '<a class="rank-card" data-song="' +
            esc(s.id) +
            '" href="' +
            esc(s.player) +
            '" data-need-auth="1">' +
            '<div class="num">NO.' +
            s.rank +
            " · " +
            s.num +
            "</div>" +
            "<h3>" +
            esc(s.title) +
            "</h3>" +
            '<div class="stats">' +
            "<span>完播 " +
            pct(s.completion_rate) +
            "</span>" +
            "<span>♥ " +
            s.likes +
            "</span>" +
            "<span>歌词爱心 " +
            s.hearts +
            "</span>" +
            "<span>听友 " +
            s.listeners +
            "</span>" +
            "</div>" +
            '<div class="bar"><span style="width:' +
            pct(s.completion_rate) +
            '"></span></div>' +
            "</a>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function hotHtml(list) {
    if (!list || !list.length) return '<p class="board-empty">还没有人给歌词标爱心。打开播放页，点句子右侧的♡。</p>';
    return list
      .map(function (x) {
        return (
          '<div class="hot-item"><span class="n">♥' +
          x.count +
          '</span><span class="song">' +
          esc(x.title) +
          '</span><span class="txt">' +
          esc(x.text) +
          "</span></div>"
        );
      })
      .join("");
  }

  function commentsHtml(list) {
    if (!list || !list.length) return '<p class="board-empty">留言仓还是空的。听完一首，把看法留在这里。</p>';
    return list
      .map(function (c) {
        var stars = c.rating ? '<span class="stars">' + "★".repeat(c.rating) + "</span>" : "";
        return (
          '<article class="comment-card"><div class="meta"><span>' +
          esc(c.author) +
          "</span><span>" +
          esc(c.title) +
          "</span>" +
          stars +
          "<span>" +
          esc(String(c.created_at || "").replace("T", " ").slice(0, 16)) +
          "</span></div><div class=\"body\">" +
          esc(c.body) +
          "</div></article>"
        );
      })
      .join("");
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

  function composeHtml(me) {
    var needLogin = me && me.auth_configured && me.auth_required && !me.authenticated;
    var lock = needLogin
      ? '<p class="board-empty">登录后才能写入留言仓。完播与点赞也会记到你的听歌身份上。<a href="/sign-in?return_to=/board.html">去登录</a></p>'
      : "";
    return (
      "<h2>写下看法</h2>" +
      lock +
      '<textarea id="boardBody" maxlength="800" placeholder="这首让你停在哪一句？想不想再听？不必写乐评腔。" ' +
      (needLogin ? "disabled" : "") +
      "></textarea>" +
      '<div class="row">' +
      '<select id="boardSongSel"></select>' +
      '<span class="rate-label">评分</span>' +
      starsHtml("boardRate") +
      '<button type="button" class="primary" id="boardSend"' +
      (needLogin ? " disabled" : "") +
      ">写入留言仓</button>" +
      "</div>" +
      '<p class="board-empty" id="boardHint"></p>'
    );
  }

  function fillSongSel(songs) {
    var sel = document.getElementById("boardSongSel");
    if (!sel) return;
    sel.innerHTML =
      '<option value="">整张 EP</option>' +
      (songs || [])
        .map(function (s) {
          return (
            '<option value="' +
            esc(s.id) +
            '"' +
            (s.id === song ? " selected" : "") +
            ">" +
            esc(s.title) +
            "</option>"
          );
        })
        .join("");
  }

  function bindNav() {
    document.querySelectorAll(".board-nav a[data-song]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        setSong(a.getAttribute("data-song") || "");
      });
    });
  }

  function bindCompose() {
    var btn = document.getElementById("boardSend");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var body = (document.getElementById("boardBody").value || "").trim();
      var hint = document.getElementById("boardHint");
      if (!body) {
        hint.textContent = "先写一句再送进留言仓。";
        return;
      }
      api("/api/ep/comment", {
        song_id: document.getElementById("boardSongSel").value,
        body: body,
        rating: getRating("boardRate")
      }).then(function (j) {
        if (j._status === 401) {
          location.href = "/sign-in?return_to=" + encodeURIComponent(location.pathname + location.search);
          return;
        }
        if (j.detail && j._status >= 400) {
          hint.textContent = j.detail;
          return;
        }
        document.getElementById("boardBody").value = "";
        paintStars(document.getElementById("boardRate"), 0);
        hint.textContent = "已写入。";
        load();
      });
    });
  }

  function currentTitle(songs) {
    if (!song) return { h: "留言仓", en: "Harbor", p: "四曲完播、点赞与歌词爱心都汇在这里。点歌名进播放页，句子右侧可以标♡。" };
    var s = (songs || []).filter(function (x) { return x.id === song; })[0];
    if (!s) return { h: "留言仓", en: "Harbor", p: "" };
    return {
      h: s.title,
      en: s.en,
      p: s.pitch + " 完播率 " + pct(s.completion_rate) + " · 全 EP 第 " + s.rank + "。"
    };
  }

  function load() {
    var q = song ? "?song=" + encodeURIComponent(song) : "";
    api("/api/board" + q).then(function (j) {
      var songs = j.songs || [];
      var hero = currentTitle(songs);
      var ranking = j.ranking || songs;
      root.innerHTML =
        '<aside class="board-nav" id="boardNav">' +
        navHtml(songs) +
        "</aside>" +
        '<div class="board-main">' +
        '<header class="board-hero"><h1>' +
        esc(hero.h) +
        '</h1><p class="en">' +
        esc(hero.en) +
        "</p><p>" +
        esc(hero.p) +
        "</p></header>" +
        (song ? "" : rankCards(ranking)) +
        (song
          ? rankCards((ranking || []).filter(function (s) { return s.id === song; }))
          : "") +
        '<section class="lyric-hot"><h2>热门歌词爱心</h2>' +
        hotHtml(j.popular_lyrics) +
        "</section>" +
        '<section class="board-compose" id="boardCompose">' +
        composeHtml(j.me) +
        "</section>" +
        '<section class="board-stream"><h2>听友看法</h2>' +
        commentsHtml(j.comments) +
        "</section></div>";
      fillSongSel(songs);
      bindNav();
      bindCompose();
      bindStars("boardRate");
    });
  }

  load();
})();
