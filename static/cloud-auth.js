(function () {
  function qs(id) { return document.getElementById(id); }

  function guestKey() {
    var k = localStorage.getItem("chenfu_guest");
    if (k && /^guest-[a-f0-9]{12}$/.test(k)) return k;
    var raw =
      (window.crypto && crypto.randomUUID && crypto.randomUUID().replace(/-/g, "")) ||
      Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
    k = "guest-" + raw.slice(0, 12);
    localStorage.setItem("chenfu_guest", k);
    return k;
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
    return document.querySelectorAll("[data-need-auth], a[href*='player.html'], a.btn-pill[href*='_ep/']");
  }
  window.chenfuApi("/api/me")
    .then(function (r) { return r.json(); })
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
          var narrow = window.matchMedia("(max-width: 860px)").matches;
          user.hidden = narrow;
          user.textContent = narrow ? "已登录" : label;
          user.title = label;
        }
        document.dispatchEvent(new CustomEvent("chenfu-auth", { detail: me }));
        return;
      }
      document.dispatchEvent(new CustomEvent("chenfu-auth", { detail: me }));
      if (!me.auth_configured || !me.auth_required) return;
      needAuthLinks().forEach(function (a) {
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          var to = a.getAttribute("href") || "/";
          location.href = "/sign-in?return_to=" + encodeURIComponent(to);
        });
      });
      if (document.body.classList.contains("hub-page")) {
        var bar = document.createElement("div");
        bar.className = "hub-auth-banner is-on";
        bar.innerHTML = "登录后可进入歌词卡听歌 · <a href='/sign-in'>去登录</a>";
        document.body.appendChild(bar);
      }
    })
    .catch(function () {});
})();
