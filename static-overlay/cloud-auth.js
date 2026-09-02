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

  function ALBUM() {
    return [
      { id: "bait", key: "饵_ep", player: "/《饵》/饵_ep/player.html", mp3: "/《饵》/饵_ep/assets/audio/饵_v34_A.mp3" },
      { id: "shark", key: "鲨鱼_EP_5.1", player: "/《鲨鱼》/鲨鱼_EP_5.1/player.html", mp3: "/《鲨鱼》/鲨鱼_EP_5.1/assets/audio/鲨鱼_5.1_Cover_A_t12.mp3" },
      { id: "sub", key: "潜水艇_ep", player: "/《潜水艇》/潜水艇_ep/player.html", mp3: "/《潜水艇》/潜水艇_ep/assets/audio/潜水艇3.0_A.mp3" },
      { id: "volcano", key: "火山群岛_ep", player: "/《火山群岛》/火山群岛_ep/player.html", mp3: "/《火山群岛》/火山群岛_ep/assets/audio/火山群岛_v2fresh_A.mp3" }
    ];
  }

  function albumIndexFromText(text) {
    var raw = String(text || "");
    try {
      raw = decodeURIComponent(raw);
    } catch (e) {}
    var list = ALBUM();
    for (var i = 0; i < list.length; i++) {
      if (raw.indexOf(list[i].key) >= 0 || raw.indexOf(list[i].mp3) >= 0) return i;
    }
    return -1;
  }

  function mp3ForPlayer(href) {
    var idx = albumIndexFromText(playerPath(href) + " " + href);
    if (idx < 0) return "";
    var mp3 = ALBUM()[idx].mp3;
    try {
      return encodeURI(mp3);
    } catch (e) {
      return mp3;
    }
  }

  var lastAdvanceAt = 0;

  function albumMode() {
    var loopOne = false;
    var shuffle = false;
    try {
      loopOne = sessionStorage.getItem("chenfu_loop_one") === "1";
      shuffle = sessionStorage.getItem("chenfu_shuffle") === "1";
    } catch (e) {}
    if (loopOne) shuffle = false;
    return { loopOne: loopOne, shuffle: shuffle };
  }

  function currentAlbumHref() {
    var iframe = document.getElementById("chenfuLiveFrame");
    if (iframe && iframe.getAttribute("src")) return iframe.getAttribute("src");
    if (iframe && iframe.src) return iframe.src;
    return location.href;
  }

  function nextAlbumPlayer(fromHref) {
    var list = ALBUM();
    var mode = albumMode();
    var idx = albumIndexFromText(fromHref || currentAlbumHref());
    var boot = window.__chenfuBootAudio || document.getElementById("chenfuBootAudio") || document.getElementById("audio");
    if (idx < 0 && boot) idx = albumIndexFromText(boot.currentSrc || boot.src || "");
    if (idx < 0) idx = 0;
    if (mode.shuffle && list.length > 1) {
      var pick = idx;
      var guard = 0;
      while (pick === idx && guard < 8) {
        pick = Math.floor(Math.random() * list.length);
        guard += 1;
      }
      return list[pick].player;
    }
    return list[(idx + 1) % list.length].player;
  }

  function chenfuAdvanceAlbum() {
    if (Date.now() - lastAdvanceAt < 1200) return;
    lastAdvanceAt = Date.now();
    var boot = ensureBootAudio();
    var mode = albumMode();
    if (mode.loopOne) {
      try {
        boot.currentTime = 0;
      } catch (e) {}
      boot.play().catch(function () {});
      lastAdvanceAt = 0;
      return;
    }
    openPlayerInPlace(nextAlbumPlayer());
  }

  window.chenfuAdvanceAlbum = chenfuAdvanceAlbum;

  function bindAlbumLoop(boot) {
    if (!boot || boot.dataset.chenfuAlbumBound) return;
    boot.dataset.chenfuAlbumBound = "1";
    boot.addEventListener("ended", function () {
      chenfuAdvanceAlbum();
    });
  }

  function ensureBootAudio() {
    if (window.parent !== window) {
      try {
        if (window.parent.chenfuBootAudioEl) {
          var parentBoot = window.parent.chenfuBootAudioEl();
          if (parentBoot) return parentBoot;
        }
      } catch (e) {}
    }
    var boot = document.getElementById("chenfuBootAudio");
    if (boot) {
      window.__chenfuBootAudio = boot;
      bindAlbumLoop(boot);
      return boot;
    }
    if (window.__chenfuBootAudio && window.__chenfuBootAudio.isConnected) {
      bindAlbumLoop(window.__chenfuBootAudio);
      return window.__chenfuBootAudio;
    }
    var local = document.getElementById("audio");
    if (local && window.parent === window) {
      window.__chenfuBootAudio = local;
      bindAlbumLoop(local);
      return local;
    }
    boot = document.createElement("audio");
    boot.id = "chenfuBootAudio";
    boot.setAttribute("playsinline", "");
    boot.setAttribute("webkit-playsinline", "");
    boot.setAttribute("preload", "auto");
    boot.style.display = "none";
    document.body.appendChild(boot);
    window.__chenfuBootAudio = boot;
    bindAlbumLoop(boot);
    return boot;
  }

  function bootFileName(u) {
    try {
      return decodeURIComponent(String(u || "").split("?")[0].split("/").pop() || "");
    } catch (e) {
      return String(u || "");
    }
  }

  function playBootFor(href) {
    var src = mp3ForPlayer(href);
    if (!src) return null;
    var boot = ensureBootAudio();
    boot.setAttribute("playsinline", "");
    boot.setAttribute("webkit-playsinline", "");
    try {
      boot.loop = sessionStorage.getItem("chenfu_loop_one") === "1";
    } catch (e) {
      boot.loop = false;
    }
    var want = bootFileName(src);
    var have = bootFileName(boot.currentSrc || boot.src);
    if (!have || (want && have !== want)) {
      boot.src = src;
    }
    var p = boot.play();
    if (p && p.catch) p.catch(function () {});
    return boot;
  }

  var vvBound = false;
  function pinLivePlayerToVisualViewport() {
    var layer = document.getElementById("chenfuLivePlayer");
    if (!layer) return;
    var vv = window.visualViewport;
    if (!vv) return;
    layer.style.top = vv.offsetTop + "px";
    layer.style.left = vv.offsetLeft + "px";
    layer.style.width = vv.width + "px";
    layer.style.height = vv.height + "px";
    layer.style.right = "auto";
    layer.style.bottom = "auto";
  }
  function pinSoon() {
    pinLivePlayerToVisualViewport();
    requestAnimationFrame(pinLivePlayerToVisualViewport);
    setTimeout(pinLivePlayerToVisualViewport, 80);
    setTimeout(pinLivePlayerToVisualViewport, 320);
  }
  function onVisualViewportChange() {
    pinSoon();
  }
  function bindVisualViewport(on) {
    var vv = window.visualViewport;
    if (on) {
      pinSoon();
      if (!vvBound) {
        if (vv) {
          vv.addEventListener("resize", onVisualViewportChange);
          vv.addEventListener("scroll", onVisualViewportChange);
        }
        window.addEventListener("resize", onVisualViewportChange);
        window.addEventListener("orientationchange", onVisualViewportChange);
        vvBound = true;
      }
    } else if (vvBound) {
      if (vv) {
        vv.removeEventListener("resize", onVisualViewportChange);
        vv.removeEventListener("scroll", onVisualViewportChange);
      }
      window.removeEventListener("resize", onVisualViewportChange);
      window.removeEventListener("orientationchange", onVisualViewportChange);
      vvBound = false;
    }
  }

  function hideUnderlyingPage(on) {
    var keep = { chenfuLivePlayer: 1, chenfuBootAudio: 1, chenfuBoardLayer: 1 };
    var kids = document.body ? document.body.children : [];
    for (var i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (keep[el.id]) continue;
      if (el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
      if (on) {
        el.setAttribute("data-chenfu-under", "1");
        el.setAttribute("aria-hidden", "true");
        try {
          el.inert = true;
        } catch (e) {}
      } else if (el.getAttribute("data-chenfu-under") === "1") {
        el.removeAttribute("data-chenfu-under");
        el.removeAttribute("aria-hidden");
        try {
          el.inert = false;
        } catch (e2) {}
      }
    }
    var vids = document.querySelectorAll("video");
    for (var j = 0; j < vids.length; j++) {
      var v = vids[j];
      if (v.closest && v.closest("#chenfuLivePlayer")) continue;
      if (on) {
        try {
          v.pause();
        } catch (e3) {}
      }
    }
  }

  function closeLivePlayer(useBack) {
    var layer = document.getElementById("chenfuLivePlayer");
    if (layer) layer.remove();
    bindVisualViewport(false);
    hideUnderlyingPage(false);
    document.documentElement.classList.remove("chenfu-live-player-on");
    if (document.body) document.body.classList.remove("chenfu-live-player-on");
    var boot = window.chenfuBootAudioEl ? window.chenfuBootAudioEl() : document.getElementById("chenfuBootAudio");
    if (boot && !boot.paused) boot.pause();
    if (useBack) {
      try {
        if (history.state && history.state.chenfuLive) history.back();
      } catch (e) {}
    }
  }

  function samePlayerDest(a, b) {
    try {
      var ua = new URL(a, location.origin);
      var ub = new URL(b, location.origin);
      return (
        decodeURIComponent(ua.pathname) === decodeURIComponent(ub.pathname) &&
        ua.search === ub.search
      );
    } catch (e) {
      return String(a || "") === String(b || "");
    }
  }

  function openPlayerInPlace(href) {
    if (window.parent !== window) {
      try {
        if (window.parent.chenfuOpenPlayer) {
          window.parent.chenfuOpenPlayer(href);
          return;
        }
      } catch (e0) {}
    }
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
    document.body.appendChild(layer);
    document.documentElement.classList.add("chenfu-live-player-on");
    if (document.body) document.body.classList.add("chenfu-live-player-on");
    hideUnderlyingPage(true);
    bindVisualViewport(true);
    var iframe = document.getElementById("chenfuLiveFrame");
    var nextSrc = dest;
    if (!samePlayerDest(iframe.getAttribute("src") || "", nextSrc)) iframe.src = nextSrc;
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
    return (
      document.getElementById("chenfuBootAudio") ||
      window.__chenfuBootAudio ||
      document.getElementById("audio")
    );
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
      var isLivePlayer = /player\.html/i.test(location.pathname || "");
      if (!isLivePlayer) {
        document.documentElement.classList.add("chenfu-embed");
        if (document.body) document.body.classList.add("chenfu-embed");
      }
      document.addEventListener(
        "click",
        function (ev) {
          var a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
          if (!a) return;
          var href = a.getAttribute("href") || "";
          // 只用属性值判断意图；a.href 会把 "#" 解析成当前页（含 player.html）
          if (href.indexOf("player.html") >= 0) {
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
