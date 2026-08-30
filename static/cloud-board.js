(function () {
  var params = new URLSearchParams(location.search);
  var song = params.get("song") || "";
  var sectionRaw = params.get("section");
  var section = sectionRaw !== null ? sectionRaw : song ? "" : "dev";
  var embed = params.get("embed") === "1" || window.parent !== window;
  if (embed) {
    document.documentElement.classList.add("board-embed");
    if (document.body) document.body.classList.add("board-embed");
  }
  if (sectionRaw === null && !song && section === "dev" && !embed) {
    var initUrl = new URL(location.href);
    initUrl.searchParams.set("section", "dev");
    history.replaceState({}, "", initUrl);
  }
  var root = document.getElementById("boardApp");
  if (!root) return;

  var boardData = null;
  var loadSeq = 0;
  var CATALOG = [
    { id: "bait", title: "饵", en: "Bait", num: "01", player: "/《饵》/饵_ep/player.html", pitch: "纯粹与占有。戏谑来时，用不回应握住主动权。" },
    { id: "shark", title: "鲨鱼", en: "Shark", num: "02", player: "/《鲨鱼》/鲨鱼_EP_5.1/player.html", pitch: "明知鱼鳍即危险，仍一步步进。再浮向晨光。" },
    { id: "sub", title: "潜水艇", en: "Submarine", num: "03", player: "/《潜水艇》/潜水艇_ep/player.html", pitch: "隔着潜望镜想上岸。岛屿忽远又忽近。" },
    { id: "volcano", title: "火山群岛", en: "Volcanic Archipelago", num: "04", player: "/《火山群岛》/火山群岛_ep/player.html", pitch: "反传统叙事的人。听不懂就算了——正好。" }
  ];

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

  function songsForNav() {
    return (boardData && boardData.songs && boardData.songs.length) ? boardData.songs : CATALOG;
  }

  function updateNavActive() {
    document.querySelectorAll(".board-nav a[data-song], .board-nav a[data-section]").forEach(function (a) {
      var sec = a.getAttribute("data-section") || "";
      var sid = a.getAttribute("data-song") || "";
      var isDev = sec === "dev";
      var on = isDev ? section === "dev" : !section && sid === (song || "");
      a.classList.toggle("is-on", on);
    });
  }

  function ensureShell() {
    if (document.getElementById("boardNav")) {
      updateNavActive();
      return;
    }
    root.innerHTML =
      '<aside class="board-nav" id="boardNav">' +
      navHtml(songsForNav()) +
      '</aside><div class="board-main" id="boardMain"><p class="board-empty board-loading">加载中…</p></div>';
    bindNav();
  }

  function renderNav(songs) {
    var nav = document.getElementById("boardNav");
    if (!nav) return;
    nav.innerHTML = navHtml(songs);
    bindNav();
    updateNavActive();
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
            '">' +
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
            (s.completes || 0) +
            " 次</span><span>深度 " +
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
      'Nick" maxlength="24" placeholder="署名（可选，留空则为匿名泡泡）" value="' +
      esc(savedNick()) +
      '"/></div>'
    );
  }

  function readNickPayload(prefix) {
    var nickEl = document.getElementById(prefix + "Nick");
    var nick = nickEl ? (nickEl.value || "").trim() : "";
    if (nick) localStorage.setItem("chenfu_nick", nick);
    return { display_name: nick || "匿名泡泡", anonymous: false };
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

  function adminToolsDevReply(id) {
    if (!isAdmin()) return "";
    return (
      '<button type="button" class="admin-btn admin-btn--danger" data-admin-del-dev-reply="' +
      id +
      '">删除</button>'
    );
  }

  function devReplyHtml(r, messageId) {
    var nested = r.parent_reply_id ? " dev-reply--nested" : "";
    return (
      '<div class="dev-reply' +
      nested +
      '" data-reply-id="' +
      r.id +
      '"><div class="meta"><span>' +
      esc(r.author) +
      "</span><span>" +
      esc(String(r.created_at || "").replace("T", " ").slice(0, 16)) +
      "</span>" +
      adminToolsDevReply(r.id) +
      '</div><div class="body">' +
      esc(r.body) +
      '</div><button type="button" class="dev-reply-btn ghost-link" data-reply-to="' +
      r.id +
      '" data-msg="' +
      messageId +
      '" data-author="' +
      esc(r.author) +
      '">回复</button></div>'
    );
  }

  function devMessagesHtml(list) {
    if (!list || !list.length) return '<p class="board-empty">还没有留言。Bug、建议、合作意向都欢迎，所有人可见。</p>';
    return list
      .map(function (m) {
        var replies = (m.replies || []).map(function (r) {
          return devReplyHtml(r, m.id);
        }).join("");
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
          '</div><div class="dev-replies">' +
          replies +
          '</div><div class="dev-reply-compose" data-compose-for="' +
          m.id +
          '" hidden><p class="dev-reply-target"></p><textarea maxlength="500" placeholder="写下回复…"></textarea><div class="row">' +
          nickRow("devR" + m.id) +
          '<button type="button" class="primary dev-reply-send" data-msg="' +
          m.id +
          '">发送回复</button><button type="button" class="dev-reply-cancel">取消</button></div><p class="board-empty dev-reply-hint"></p></div>' +
          '<button type="button" class="dev-reply-toggle ghost-link" data-msg="' +
          m.id +
          '">回复</button></article>'
        );
      })
      .join("");
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
    if (!list || !list.length) return '<p class="board-empty">留言板还是空的。听完一首，把看法留在这里。</p>';
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

  function openDevReplyCompose(article, parentReplyId, replyAuthor) {
    if (!article) return;
    var box = article.querySelector(".dev-reply-compose");
    if (!box) return;
    box.hidden = false;
    box.dataset.parentReplyId = parentReplyId || "";
    var target = box.querySelector(".dev-reply-target");
    if (target) {
      target.textContent = parentReplyId && replyAuthor ? "回复 @" + replyAuthor : "回复这条留言";
    }
    var ta = box.querySelector("textarea");
    if (ta) ta.focus();
  }

  function closeDevReplyCompose(box) {
    if (!box) return;
    box.hidden = true;
    box.dataset.parentReplyId = "";
    var ta = box.querySelector("textarea");
    if (ta) ta.value = "";
    var hint = box.querySelector(".dev-reply-hint");
    if (hint) hint.textContent = "";
  }

  function bindDevReplies() {
    document.querySelectorAll(".dev-reply-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var article = btn.closest(".dev-msg");
        openDevReplyCompose(article, "", "");
      });
    });
    document.querySelectorAll(".dev-reply-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var article = btn.closest(".dev-msg");
        openDevReplyCompose(article, btn.getAttribute("data-reply-to"), btn.getAttribute("data-author"));
      });
    });
    document.querySelectorAll(".dev-reply-cancel").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeDevReplyCompose(btn.closest(".dev-reply-compose"));
      });
    });
    document.querySelectorAll(".dev-reply-send").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var article = btn.closest(".dev-msg");
        var box = btn.closest(".dev-reply-compose");
        if (!article || !box) return;
        var ta = box.querySelector("textarea");
        var body = (ta && ta.value || "").trim();
        var hint = box.querySelector(".dev-reply-hint");
        if (!body) {
          if (hint) hint.textContent = "先写几句再发送。";
          return;
        }
        var mid = Number(btn.getAttribute("data-msg") || article.getAttribute("data-id"));
        var parentRaw = box.dataset.parentReplyId;
        var payload = Object.assign({ message_id: mid, body: body }, readNickPayload("devR" + mid));
        if (parentRaw) payload.parent_reply_id = Number(parentRaw);
        api("/api/ep/dev-reply", payload).then(function (j) {
          if (j._status >= 400) {
            if (hint) hint.textContent = j.detail || "发送失败";
            return;
          }
          closeDevReplyCompose(box);
          load();
        });
      });
    });
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
      '<button type="button" class="primary" id="boardSend">写入留言板</button>' +
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
        hint.textContent = "先写一句再送进留言板。";
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
    document.querySelectorAll("[data-admin-del-dev-reply]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("确定删除这条回复？")) return;
        adminDelete("/api/ep/admin/dev-reply/" + btn.getAttribute("data-admin-del-dev-reply")).then(function () {
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
        hint.textContent = "已发送，所有人可见。";
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
        p: "Bug、建议、合作意向都欢迎。留言与回复所有人可见，可互相讨论。"
      };
    }
    if (!song) return { h: "留言板", en: "Harbor", p: "四曲完播、点赞与歌词爱心都汇在这里。点歌名进播放页，句子右侧可以标♡。" };
    var s = (songs || []).filter(function (x) { return x.id === song; })[0];
    if (!s) return { h: "留言板", en: "Harbor", p: "" };
    return {
      h: s.title,
      en: s.en,
      p: s.pitch + " 完播 " + (s.completes || 0) + " 次 · 深度 " + pct(s.completion_rate) + " · 全 EP 第 " + s.rank + "。"
    };
  }

  function devMain(j, hero) {
    return (
      '<section class="board-stream"><h2>公开留言与回复</h2>' +
      devMessagesHtml(j.dev_messages) +
      "</section>" +
      '<section class="board-compose dev-compose">' +
      devComposeHtml() +
      "</section>" +
      carouselHtml(j.carousel, j.announcements)
    );
  }

  function devTeaser(list) {
    if (!list || !list.length) return "";
    return (
      '<section class="board-stream board-dev-teaser"><h2>写给开发者</h2>' +
      devMessagesHtml(list.slice(0, 8)) +
      '<p class="board-more"><a href="/board.html?section=dev" data-open-dev="1">查看全部与回复 ›</a></p></section>'
    );
  }

  function songMain(j, hero, songs, ranking) {
    return (
      (song ? "" : rankCards(ranking)) +
      (song ? rankCards((ranking || []).filter(function (s) { return s.id === song; })) : "") +
      (song ? "" : devTeaser(j.dev_messages)) +
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
    ensureShell();
    updateNavActive();
    var main = document.getElementById("boardMain");
    if (main) main.innerHTML = '<p class="board-empty board-loading">加载中…</p>';
    var seq = ++loadSeq;
    var q = [];
    if (section === "dev") q.push("section=dev");
    else if (song) q.push("song=" + encodeURIComponent(song));
    api("/api/board" + (q.length ? "?" + q.join("&") : ""))
      .then(function (j) {
        if (seq !== loadSeq) return;
        boardData = j;
        var songs = j.songs || CATALOG;
        renderNav(songs);
        var hero = currentTitle(songs);
        var ranking = j.ranking || songs;
        if (!main) return;
        main.innerHTML =
          '<header class="board-hero"><h1>' +
          esc(hero.h) +
          '</h1><p class="en">' +
          esc(hero.en) +
          "</p><p>" +
          esc(hero.p) +
          "</p></header>" +
          (section === "dev" ? devMain(j, hero) : songMain(j, hero, songs, ranking));
        if (section !== "dev") {
          fillSongSel(songs);
          bindCompose();
          bindStars("boardRate");
          syncFlowerFromSong("boardFlower", (document.getElementById("boardSongSel") || {}).value || song);
          document.querySelectorAll("[data-open-dev]").forEach(function (a) {
            a.addEventListener("click", function (ev) {
              ev.preventDefault();
              setView("", "dev");
            });
          });
        } else {
          bindDevCompose();
          bindDevReplies();
          startCarousel();
        }
        bindAdmin();
      })
      .catch(function () {
        if (seq !== loadSeq || !main) return;
        main.innerHTML = '<p class="board-empty">加载失败，请刷新页面重试。游客无需登录即可查看写给开发者的留言。</p>';
      });
  }

  ensureShell();
  load();

  if (embed) {
    document.addEventListener(
      "click",
      function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
        if (!a) return;
        var href = a.getAttribute("href") || "";
        if (href.indexOf("player.html") < 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        try {
          window.parent.postMessage(
            { type: "chenfu-board-to-player", href: a.href },
            location.origin
          );
        } catch (e) {}
      },
      true
    );
  }
})();
