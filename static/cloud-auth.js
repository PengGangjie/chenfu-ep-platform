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

  function playerPath(href) {
    try {
      return decodeURIComponent(new URL(href, location.origin).pathname);
    } catch (e) {
      return String(href || "");
    }
  }

  function isPlayerHref(href) {
    href = String(href || "");
    return href.indexOf("player.html") >= 0;
  }

  function isSamePlayerHref(href) {
    if (!href || !isPlayerHref(href)) return false;
    try {
      var a = new URL(href, location.origin);
      var b = new URL(location.href);
      return decodeURIComponent(a.pathname) === decodeURIComponent(b.pathname);
    } catch (e) {
      return false;
    }
  }

  function mp3ForPlayer(href) {
    var path = playerPath(href);
    var map = [
      ["饵_ep", "/《饵》/饵_ep/assets/audio/饵_v34_A.mp3"],
      ["鲨鱼_EP_5.1", "/《鲨鱼》/鲨鱼_EP_5.1/assets/audio/鲨鱼_5.1_Cover_A_t12.mp3"],
      ["潜水艇_ep", "/《潜水艇》/潜水艇_ep/assets/audio/潜水艇3.0_A.mp3"],
      ["火山群岛_ep", "/《火山群岛》/火山群岛_ep/assets/audio/火山群岛_v2fresh_A.mp3"]
    ];
    for (var i = 0; i < map.length; i++) {
      if (path.indexOf(map[i][0]) >= 0) {
        try {
          return encodeURI(map[i][1]);
        } catch (e) {
          return map[i][1];
        }
      }
    }
    return "";
  }

  function ensureBootAudio() {
    var boot = document.getElementById("chenfuBootAudio");
    if (boot) return boot;
    boot = document.createElement("audio");
    boot.id = "chenfuBootAudio";
    boot.setAttribute("playsinline", "");
    boot.setAttribute("webkit-playsinline", "");
    boot.setAttribute("preload", "auto");
    boot.style.display = "none";
    document.body.appendChild(boot);
    return boot;
  }

  function playBootFor(href) {
    var src = mp3ForPlayer(href);
    if (!src) return null;
    var boot = ensureBootAudio();
    boot.setAttribute("playsinline", "");
    boot.setAttribute("webkit-playsinline", "");
    try {
      var abs = new URL(src, location.origin).href;
      if (boot.src !== abs) boot.src = src;
    } catch (e) {
      boot.src = src;
    }
    var p = boot.play();
    if (p && p.catch) p.catch(function () {});
    return boot;
  }

  function closeLivePlayer(useBack) {
    var layer = document.getElementById("chenfuLivePlayer");
    if (layer) layer.remove();
    document.documentElement.classList.remove("chenfu-live-player-on");
    if (document.body) document.body.classList.remove("chenfu-live-player-on");
    var boot = document.getElementById("chenfuBootAudio");
    if (boot && !boot.paused) boot.pause();
    if (useBack) {
      try {
        if (history.state && history.state.chenfuLive) history.back();
      } catch (e) {}
    }
  }

  function openPlayerInPlace(href) {
    if (!href || !isPlayerHref(href)) return;
    var url;
    try {
      url = new URL(href, location.origin);
    } catch (e) {
      return;
    }
    url.searchParams.set("autoplay", "1");
    var dest = url.pathname + url.search + url.hash;
    markEnterPlayer(dest);

    if (isSamePlayerHref(href) && document.getElementById("audio") && !document.getElementById("chenfuLivePlayer")) {
      var local = document.getElementById("audio");
      local.setAttribute("playsinline", "");
      local.play().catch(function () {});
      return;
    }

    playBootFor(dest);

    var layer = document.getElementById("chenfuLivePlayer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "chenfuLivePlayer";
      layer.className = "chenfu-live-player";
      var frame = document.createElement("iframe");
      frame.id = "chenfuLiveFrame";
      frame.title = "歌词卡";
      frame.setAttribute("allow", "autoplay; autoplay-media; fullscreen");
      frame.allow = "autoplay";
      layer.appendChild(frame);
      document.body.appendChild(layer);
    }
    document.documentElement.classList.add("chenfu-live-player-on");
    if (document.body) document.body.classList.add("chenfu-live-player-on");
    var iframe = document.getElementById("chenfuLiveFrame");
    var nextSrc = dest;
    if (iframe.getAttribute("src") !== nextSrc) iframe.src = nextSrc;
    try {
      if (!(history.state && history.state.chenfuLive)) {
        history.pushState({ chenfuLive: 1 }, "", dest);
      } else {
        history.replaceState({ chenfuLive: 1 }, "", dest);
      }
    } catch (e) {}
  }

  window.chenfuOpenPlayer = openPlayerInPlace;
  window.chenfuCloseLivePlayer = closeLivePlayer;
  window.chenfuBootAudioEl = function () {
    return document.getElementById("chenfuBootAudio");
  };

  window.addEventListener("popstate", function () {
    if (document.getElementById("chenfuLivePlayer")) closeLivePlayer(false);
  });

  function interceptPlayerEnter(ev) {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (ev.button && ev.button !== 0) return;
    var t = ev.target;
    if (t && t.closest && t.closest("#chenfuLivePlayer")) return;
    var a = t && t.closest ? t.closest("a") : null;
    if (!a) return;
    var href = a.href || a.getAttribute("href") || "";
    if (!isPlayerHref(href) && !isPlayerHref(a.getAttribute("href") || "")) return;
    if ((a.getAttribute("href") || "") === "#play" || href.indexOf("#play") >= 0 && isSamePlayerHref(href)) {
      if (document.getElementById("audio")) {
        ev.preventDefault();
        document.getElementById("audio").play().catch(function () {});
      }
      return;
    }
    if (window.parent !== window) {
      try {
        if (window.parent.chenfuOpenPlayer) {
          ev.preventDefault();
          if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
          ev.stopPropagation();
          window.parent.chenfuOpenPlayer(href);
          return;
        }
      } catch (e) {}
    }
    ev.preventDefault();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    ev.stopPropagation();
    var now = Date.now();
    if (window.__chenfuPlayerOpenAt && now - window.__chenfuPlayerOpenAt < 400) return;
    window.__chenfuPlayerOpenAt = now;
    openPlayerInPlace(href);
  }

  document.addEventListener("pointerdown", interceptPlayerEnter, true);
  document.addEventListener("click", interceptPlayerEnter, true);

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

  function stayPlayKind(a) {
    if (!a) return "";
    var href = a.getAttribute("href") || "";
    var abs = a.href || "";
    if (href === "#play" || href.indexOf("#play") === 0) return "";
    if (isBoardHref(href) || isBoardHref(abs)) return "board";
    if (href.indexOf("player.html") >= 0 || abs.indexOf("player.html") >= 0) return "";
    try {
      var u = new URL(abs, location.origin);
      if (u.origin !== location.origin) return "";
      var path = decodeURIComponent(u.pathname || "/");
      if (!path || path === "/") return "hub";
      if (path === "/index.html") return "hub";
      if (path.indexOf("player.html") >= 0) return "";
      if (/\/(饵_ep|鲨鱼_EP_5\.1|潜水艇_ep|火山群岛_ep)(\/|$)/.test(path)) return "chapter";
      if (/\/index\.html$/i.test(path)) return "hub";
    } catch (e) {}
    return "";
  }

  function interceptStayWhilePlaying(ev) {
    if (!document.getElementById("audio")) return;
    if (document.body && document.body.classList.contains("board-page")) return;
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    if (ev.button && ev.button !== 0) return;
    var t = ev.target;
    if (t && t.closest && t.closest("#chenfuNowPlay")) return;
    var a = t && t.closest ? t.closest("a") : null;
    if (!a) return;
    if (t && t.closest && t.closest("#chenfuBoardLayer")) return;
    var kind = stayPlayKind(a);
    if (!kind) return;
    ev.preventDefault();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    ev.stopPropagation();
    var href = a.href || a.getAttribute("href") || "";
    var now = Date.now();
    if (window.__chenfuBoardOpenAt && now - window.__chenfuBoardOpenAt < 400) return;
    window.__chenfuBoardOpenAt = now;
    if (window.chenfuOpenStay) window.chenfuOpenStay(kind, href);
    else if (kind === "board" && window.chenfuOpenBoard) window.chenfuOpenBoard(href);
    else window.__chenfuStayPending = { kind: kind, href: href };
  }

  try {
    if (window.parent !== window) {
      document.documentElement.classList.add("chenfu-embed");
      if (document.body) document.body.classList.add("chenfu-embed");
      document.addEventListener(
        "click",
        function (ev) {
          var a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
          if (!a) return;
          var href = a.getAttribute("href") || "";
          if (href.indexOf("player.html") >= 0 || (a.href && a.href.indexOf("player.html") >= 0)) {
            ev.preventDefault();
            if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
            if (window.parent.chenfuOpenPlayer) window.parent.chenfuOpenPlayer(a.href);
            else if (window.parent.chenfuOnBoardPlayer) window.parent.chenfuOnBoardPlayer(a.href);
            return;
          }
          if (isBoardHref(href) || isBoardHref(a.href)) {
            ev.preventDefault();
            if (window.parent.chenfuOpenStay) window.parent.chenfuOpenStay("board", a.href);
            else if (window.parent.chenfuOpenBoard) window.parent.chenfuOpenBoard(a.href);
          }
        },
        true
      );
    }
  } catch (e) {}

  document.addEventListener("pointerdown", interceptStayWhilePlaying, true);
  document.addEventListener("click", interceptStayWhilePlaying, true);
})();
