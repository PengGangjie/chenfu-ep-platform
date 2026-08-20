(function () {
  function qs(id) { return document.getElementById(id); }
  function needAuthLinks() {
    return document.querySelectorAll("[data-need-auth], a[href*='player.html'], a.btn-pill[href*='_ep/']");
  }
  fetch("/api/me", { credentials: "same-origin" })
    .then(function (r) { return r.json(); })
    .then(function (me) {
      var login = qs("navLogin");
      var user = qs("navUser");
      var logout = qs("navLogout");
      if (me.authenticated) {
        if (login) login.hidden = true;
        if (logout) logout.hidden = false;
        if (user) {
          user.hidden = false;
          user.textContent = me.name || me.email || me.phone || "已登录";
        }
        return;
      }
      if (!me.auth_configured) return;
      needAuthLinks().forEach(function (a) {
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          var to = a.getAttribute("href") || "/";
          location.href = "/sign-in?return_to=" + encodeURIComponent(to);
        });
      });
      var bar = document.createElement("div");
      bar.className = "hub-auth-banner is-on";
      bar.innerHTML = "登录后可进入歌词卡听歌 · <a href='/sign-in'>去登录</a>";
      document.body.appendChild(bar);
    })
    .catch(function () {});
})();
