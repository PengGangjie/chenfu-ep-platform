(function () {
  function qs(id) { return document.getElementById(id); }

  function guestKey() {
    try {
      var k = localStorage.getItem("chenfu_guest");
      if (k && /^guest-[a-f0-9]{12}$/.test(k)) return k;
      var raw =
        (window.crypto && crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) ||
        Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
      k = "guest-" + raw.slice(0, 12);
      localStorage.setItem("chenfu_guest", k);
      return k;
    } catch (err) {
      if (window.__chenfuGuestMem) return window.__chenfuGuestMem;
      var raw2 =
        (window.crypto && crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) ||
        Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
      window.__chenfuGuestMem = "guest-" + raw2.slice(0, 12);
      return window.__chenfuGuestMem;
    }
  }

  window.chenfuGuestKey = guestKey;
  window.chenfuApi = function (path, body) {
    var opt = { credentials: "same-origin", headers: { Accept: "application/json" } };
    var gk = guestKey();
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
  };

  function needAuthLinks() {
    return document.querySelectorAll("[data-need-auth]");
  }
  window.chenfuApi("/api/me")
    .then(function (me) {
      var login = qs("navLogin");
      var user = qs("navUser");
      var logout = qs("navLogout");
      window.__chenfuMe = me;
      if (me.authenticated) {
        if (login) login.hidden = true;
        if (logout) logout.hidden = false;
        if (user) {
          var label = me.name || me.email || me.phone || "已登录";
          if (me.is_admin) label = "管理员 · " + label;
          var narrow = window.matchMedia("(max-width: 860px)").matches;
          user.hidden = narrow;
          user.textContent = narrow ? (me.is_admin ? "管理员" : "已登录") : label;
          user.title = label;
        }
        document.dispatchEvent(new CustomEvent("chenfu-auth", { detail: me }));
        return;
      }
      if (login && document.body.classList.contains("hub-page")) {
        login.hidden = true;
      }
      if (login && document.body.classList.contains("board-page")) {
        login.textContent = "管理员";
        login.title = "管理员登录";
      }
      document.dispatchEvent(new CustomEvent("chenfu-auth", { detail: me }));
      if (!me.auth_configured || !me.auth_required) {
        return;
      }
      needAuthLinks().forEach(function (a) {
        var to = a.getAttribute("href") || "/";
        if (to.indexOf("/board.html") === 0 || to === "/board") return;
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          location.href = "/sign-in?return_to=" + encodeURIComponent(to);
        });
      });
    })
    .catch(function () {});

  function markEnterPlayer(href) {
    if (!href || href.indexOf("player.html") < 0) return;
    try {
      sessionStorage.setItem("chenfu_autoplay", "1");
    } catch (e) {}
  }

  function withAutoplay(href) {
    if (!href || href.indexOf("player.html") < 0 || href.indexOf("autoplay=") >= 0) return href;
    return href + (href.indexOf("?") >= 0 ? "&" : "?") + "autoplay=1";
  }

  function preparePlayerLinks() {
    document.querySelectorAll('a[href*="player.html"]').forEach(function (a) {
      var href = a.getAttribute("href") || "";
      var next = withAutoplay(href);
      if (next !== href) a.setAttribute("href", next);
    });
  }

  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href*="player.html"]') : null;
    if (!a) return;
    markEnterPlayer(a.getAttribute("href") || a.href || "");
  }, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", preparePlayerLinks);
  } else {
    preparePlayerLinks();
  }

  function isBoardHref(href) {
    if (!href) return false;
    href = String(href);
    return href.indexOf("board.html") >= 0 || href === "/board" || /\/board(\?|#|$)/.test(href);
  }

  function interceptBoardWhilePlaying(ev) {
    if (!document.getElementById("audio")) return;
    if (document.body && document.body.classList.contains("board-page")) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (ev.button && ev.button !== 0) return;
    var t = ev.target;
    if (t && t.closest && t.closest("#chenfuBoardLayer")) return;
    var a = t && t.closest ? t.closest("a") : null;
    if (!a) return;
    if (!isBoardHref(a.getAttribute("href") || "") && !isBoardHref(a.href)) return;
    ev.preventDefault();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    ev.stopPropagation();
    var href = a.href || a.getAttribute("href") || "";
    var now = Date.now();
    if (window.__chenfuBoardOpenAt && now - window.__chenfuBoardOpenAt < 400) return;
    window.__chenfuBoardOpenAt = now;
    if (window.chenfuOpenBoard) window.chenfuOpenBoard(href);
    else window.__chenfuBoardPending = href;
  }
  document.addEventListener("pointerdown", interceptBoardWhilePlaying, true);
  document.addEventListener("click", interceptBoardWhilePlaying, true);
})();
