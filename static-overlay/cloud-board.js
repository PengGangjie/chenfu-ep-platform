(function () {
  var params = new URLSearchParams(location.search);
  var song = params.get("song") || "";
  var section = params.get("section") || "";
  var root = document.getElementById("boardApp");
  if (!root) return;

  var boardData = null;

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

  function setView(nextSong, nextSection) {
    song = nextSong || "";
    section = nextSection || "";
    var u = new URL(location.href);
    if (song) u.searchParams.set("song", song);
    else u.searchParams.delete("song");
    if (section) u.searchParams.set("section", section);
    else u.searchParams.delete("section");
    history.replaceState({}, "", u);
    load();
  }

  function navHtml(songs) {
    var items = [{ id: "", title: "总览", num: "" }].concat(songs || []);
    items.push({ id: "dev", title: "写给开发者", num: "05" });
    return (
      '<p class="eyebrow">导航仓</p>' +
      items
        .map(function (s) {
          var isDev = s.id === "dev";
          var on = isDev ? section === "dev" : !section && (s.id || "") === (song || "");
          var rank = s.num ? '<span class="rank-dot">' + s.num + "</span>" : "";
          return (
            '<a href="#" data-song="' +
            esc(isDev ? "" : s.id || "") +
            '" data-section="' +
            (isDev ? "dev" : "") +
            '" class="' +
            (on ? "is-on" : "") +
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

  function savedNick() {
    return localStorage.getItem("chenfu_nick") || "";
  }

  function nickRow(prefix) {
    return (
      '<div class="compose-nick">' +
      '<input type="text" id="' +
      prefix +
      'Nick" maxlength="24" placeholder="署名（可选，留空则显示听友/访客）" value="' +
      esc(savedNick()) +
      '"/>' +
      '<label class="anon-check"><input type="checkbox" id="' +
      prefix +
      'Anon"/> 匿名发布</label></div>'
    );
  }

  function readNickPayload(prefix) {
    var anonEl = document.getElementById(prefix + "Anon");
    var nickEl = document.getElementById(prefix + "Nick");
    var anon = !!(anonEl && anonEl.checked);
    var nick = nickEl ? (nickEl.value || "").trim() : "";
    if (!anon && nick) localStorage.setItem("chenfu_nick", nick);
    return { display_name: anon ? null : nick || null, anonymous: anon };
  }

  function isAdmin() {
    return !!(boardData && boardData.me && boardData.me.is_admin);
  }

  function adminToolsComment(c) {
    if (!isAdmin()) return "";
    var clearBtn = c.rating
      ? '<button type="button" class="admin-btn" data-admin-clear="' + c.id + '">清除评分</button>'
      : "";
    return (
      '<span class="admin-tools">' +
      clearBtn +
      '<button type="button" class="admin-btn admin-btn--danger" data-admin-del-comment="' +
      c.id +
      '">删除留言</button></span>'
    );
  }

  function adminToolsDev(id) {
    if (!isAdmin()) return "";
    return (
      '<span class="admin-tools">' +
      '<button type="button" class="admin-btn admin-btn--danger" data-admin-del-dev="' +
      id +
      '">删除</button></span>'
    );
  }

  function adminDelete(path) {
    return fetch(path, { method: "DELETE", credentials: "same-origin", headers: { Accept: "application/json" } }).then(
      function (r) {
        return r.json().then(function (j) {
          j._status = r.status;
          return j;
        });
      }
    );
  }

  function adminPost(path) {
    return fetch(path, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } }).then(
      function (r) {
        return r.json().then(function (j) {
          j._status = r.status;
          return j;
        });
      }
    );
  }

  function commentsHtml(list) {
    if (!list || !list.length) return '<p class="board-empty">留言仓还是空的。听完一首，把看法留在这里。</p>';
    return list
      .map(function (c) {
        var stars = c.rating ? '<span class="stars">' + "★".repeat(c.rating) + "</span>" : "";
        return (
          '<article class="comment-card" data-id="' +
          c.id +
          '"><div class="meta"><span>' +
          esc(c.author) +
          "</span><span>" +
          esc(c.title) +
          "</span>" +
          stars +
          "<span>" +
          esc(String(c.created_at || "").replace("T", " ").slice(0, 16)) +
          "</span>" +
          adminToolsComment(c) +
          '</div><div class="body">' +
          esc(c.body) +
          "</div></article>"
        );
      })
      .join("");
  }

  function devMessagesHtml(list) {
    if (!list || !list.length) return '<p class="board-empty">还没有写给开发者的留言。Bug、建议、合作意向都欢迎。</p>';
    return list
      .map(function (m) {
        return (
          '<article class="comment-card dev-msg" data-id="' +
          m.id +
          '"><div class="meta"><span>' +
          esc(m.author) +
          "</span><span>" +
          esc(String(m.created_at || "").replace("T", " ").slice(0, 16)) +
          "</span>" +
          adminToolsDev(m.id) +
          '</div><div class="body">' +
          esc(m.body) +
          "</div></article>"
        );
      })
      .join("");
  }

  function carouselHtml(images, announcements) {
    var imgs = (images || []).slice();
    if (imgs.length > 1) {
      var i = Math.floor(Math.random() * imgs.length);
      imgs = imgs.slice(i).concat(imgs.slice(0, i));
    }
    var slides = imgs
      .map(function (img, idx) {
        return (
          '<div class="dev-carousel-slide' +
          (idx === 0 ? " is-on" : "") +
          '">' +
          '<img src="' +
          esc(img.src) +
          '" alt="' +
          esc(img.title) +
          '" loading="lazy"/>' +
          '<div class="cap"><strong>' +
          esc(img.title) +
          "</strong><span>" +
          esc(img.caption) +
          "</span></div></div>"
        );
      })
      .join("");
    var notes = (announcements || [])
      .map(function (t) {
        return "<li>" + esc(t) + "</li>";
      })
      .join("");
    return (
      '<section class="dev-announce">' +
      "<h2>公告栏</h2>" +
      '<div class="dev-carousel" id="devCarousel">' +
      slides +
      "</div>" +
      (notes ? '<ul class="dev-notes">' + notes + "</ul>" : "") +
      "</section>"
    );
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

  function flowerHtml(id) {
    return (
      '<button type="button" class="flower-btn" id="' +
      id +
      '" aria-pressed="false" title="送花（计入点赞）">' +
      '<span class="glyph">🌸</span><span class="lab">送花</span><span class="n"></span></button>'
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

  function paintFlower(btn, likes, liked) {
    if (!btn) return;
    btn.classList.toggle("is-on", !!liked);
    btn.setAttribute("aria-pressed", liked ? "true" : "false");
    var n = btn.querySelector(".n");
    if (n) n.textContent = likes > 0 ? " · " + likes : "";
    btn.querySelector(".lab").textContent = liked ? "已送花" : "送花";
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

  function songMeta(songs, sid) {
    if (!sid) return null;
    for (var i = 0; i < (songs || []).length; i++) {
      if (songs[i].id === sid) return songs[i];
    }
    return null;
  }

  function bindFlower(btnId, getSongId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var sid = getSongId();
      if (!sid) {
        var hint = document.getElementById("boardHint") || document.getElementById("cloudNoteHint");
        if (hint) hint.textContent = "请先选择一首曲目再送花。";
        return;
      }
      api("/api/ep/like", { song_id: sid }).then(function (j) {
        if (j._status >= 400) return;
        paintFlower(btn, j.likes, j.liked);
        if (boardData && boardData.songs) {
          boardData.songs.forEach(function (s) {
            if (s.id === sid) {
              s.likes = j.likes;
              s.liked = j.liked;
            }
          });
        }
      });
    });
  }

  function syncFlowerFromSong(btnId, sid) {
    var btn = document.getElementById(btnId);
    if (!btn || !boardData) return;
    var meta = songMeta(boardData.songs, sid || song);
    if (meta) paintFlower(btn, meta.likes, meta.liked);
    else paintFlower(btn, 0, false);
  }

  function composeHtml() {
    return (
      "<h2>写下看法</h2>" +
      nickRow("board") +
      '<textarea id="boardBody" maxlength="800" placeholder="这首让你停在哪一句？想不想再听？不必写乐评腔。"></textarea>' +
      '<div class="row">' +
      '<select id="boardSongSel"></select>' +
      flowerHtml("boardFlower") +
      '<span class="rate-label">评分</span>' +
      starsHtml("boardRate") +
      '<button type="button" class="primary" id="boardSend">写入留言仓</button>' +
      "</div>" +
      '<p class="board-empty" id="boardHint"></p>'
    );
  }

  function devComposeHtml() {
    return (
      "<h2>写给开发者</h2>" +
      nickRow("dev") +
      '<textarea id="devBody" maxlength="800" placeholder="Bug、建议、合作意向、或任何想直接说的话。"></textarea>' +
      '<div class="row">' +
      '<button type="button" class="primary" id="devSend">发送留言</button>' +
      "</div>" +
      '<p class="board-empty" id="devHint"></p>'
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
    document.querySelectorAll(".board-nav a[data-song], .board-nav a[data-section]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        var sec = a.getAttribute("data-section") || "";
        if (sec === "dev") setView("", "dev");
        else setView(a.getAttribute("data-song") || "", "");
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
      api("/api/ep/comment", Object.assign({
        song_id: document.getElementById("boardSongSel").value,
        body: body,
        rating: getRating("boardRate")
      }, readNickPayload("board"))).then(function (j) {
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
    var sel = document.getElementById("boardSongSel");
    if (sel) {
      sel.addEventListener("change", function () {
        syncFlowerFromSong("boardFlower", sel.value || song);
      });
    }
    bindFlower("boardFlower", function () {
      var sel2 = document.getElementById("boardSongSel");
      return (sel2 && sel2.value) || song;
    });
  }

  function bindAdmin() {
    if (!isAdmin()) return;
    document.querySelectorAll("[data-admin-del-comment]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("确定删除这条留言？")) return;
        adminDelete("/api/ep/admin/comment/" + btn.getAttribute("data-admin-del-comment")).then(function () {
          load();
        });
      });
    });
    document.querySelectorAll("[data-admin-clear]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        adminPost("/api/ep/admin/comment/" + btn.getAttribute("data-admin-clear") + "/clear-rating").then(function () {
          load();
        });
      });
    });
    document.querySelectorAll("[data-admin-del-dev]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("确定删除这条留言？")) return;
        adminDelete("/api/ep/admin/dev-message/" + btn.getAttribute("data-admin-del-dev")).then(function () {
          load();
        });
      });
    });
  }

  function bindDevCompose() {
    var btn = document.getElementById("devSend");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var body = (document.getElementById("devBody").value || "").trim();
      var hint = document.getElementById("devHint");
      if (!body) {
        hint.textContent = "先写一句再发送。";
        return;
      }
      api("/api/ep/dev-message", Object.assign({ body: body }, readNickPayload("dev"))).then(function (j) {
        if (j.detail && j._status >= 400) {
          hint.textContent = j.detail;
          return;
        }
        document.getElementById("devBody").value = "";
        hint.textContent = "已发送，开发者会定期查看。";
        load();
      });
    });
  }

  function startCarousel() {
    var box = document.getElementById("devCarousel");
    if (!box) return;
    var slides = box.querySelectorAll(".dev-carousel-slide");
    if (slides.length < 2) return;
    var idx = 0;
    setInterval(function () {
      slides[idx].classList.remove("is-on");
      idx = (idx + 1) % slides.length;
      slides[idx].classList.add("is-on");
    }, 4500);
  }

  function currentTitle(songs) {
    if (section === "dev") {
      return {
        h: "写给开发者",
        en: "To Developer",
        p: "Bug、建议、合作意向都欢迎。公告栏会轮播专辑封面，留言仅开发者可见回复入口。"
      };
    }
    if (!song) return { h: "留言仓", en: "Harbor", p: "四曲完播、点赞与歌词爱心都汇在这里。点歌名进播放页，句子右侧可以标♡。" };
    var s = (songs || []).filter(function (x) { return x.id === song; })[0];
    if (!s) return { h: "留言仓", en: "Harbor", p: "" };
    return {
      h: s.title,
      en: s.en,
      p: s.pitch + " 完播率 " + pct(s.completion_rate) + " · 全 EP 第 " + s.rank + "。"
    };
  }

  function devMain(j, hero) {
    return (
      carouselHtml(j.carousel, j.announcements) +
      '<section class="board-compose dev-compose">' +
      devComposeHtml() +
      "</section>" +
      '<section class="board-stream"><h2>听友留言</h2>' +
      devMessagesHtml(j.dev_messages) +
      "</section>"
    );
  }

  function songMain(j, hero, songs, ranking) {
    return (
      (song ? "" : rankCards(ranking)) +
      (song ? rankCards((ranking || []).filter(function (s) { return s.id === song; })) : "") +
      '<section class="lyric-hot"><h2>热门歌词爱心</h2>' +
      hotHtml(j.popular_lyrics) +
      "</section>" +
        '<section class="board-compose" id="boardCompose">' +
        composeHtml() +
        "</section>" +
      '<section class="board-stream"><h2>听友看法</h2>' +
      commentsHtml(j.comments) +
      "</section>"
    );
  }

  function load() {
    var q = [];
    if (section === "dev") q.push("section=dev");
    else if (song) q.push("song=" + encodeURIComponent(song));
    api("/api/board" + (q.length ? "?" + q.join("&") : "")).then(function (j) {
      boardData = j;
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
        (section === "dev" ? devMain(j, hero) : songMain(j, hero, songs, ranking)) +
        "</div>";
      if (section !== "dev") {
        fillSongSel(songs);
        bindCompose();
        bindStars("boardRate");
        syncFlowerFromSong("boardFlower", (document.getElementById("boardSongSel") || {}).value || song);
      } else {
        bindDevCompose();
        startCarousel();
      }
      bindNav();
      bindAdmin();
    });
  }

  load();
})();
