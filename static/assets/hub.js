/* 《沉浮》EP Hub — 滚动显现 + 概念粒子动画 */
(function () {
  var stages = Array.prototype.slice.call(document.querySelectorAll(".hub-stage"));
  var railLinks = Array.prototype.slice.call(document.querySelectorAll(".track-rail a"));
  var arcLines = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));

  function onIntersect(entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) entry.target.classList.add("is-in");
    });
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(onIntersect, { threshold: 0.28, rootMargin: "0px 0px -8% 0px" });
    stages.forEach(function (el) { io.observe(el); });
    arcLines.forEach(function (el) { io.observe(el); });

    var trackIO = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          railLinks.forEach(function (a) {
            a.classList.toggle("is-on", a.getAttribute("href") === "#" + id);
          });
        });
      },
      { threshold: 0.45 }
    );
    ["t01", "t02", "t03", "t04"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) trackIO.observe(el);
    });
  } else {
    stages.forEach(function (el) { el.classList.add("is-in"); });
    arcLines.forEach(function (el) { el.classList.add("is-in"); });
  }

  // 氛围视频：进入视口再加载；无文件则静默跳过（兼容 file://）
  function armVideos() {
    var vids = Array.prototype.slice.call(document.querySelectorAll("video.hub-video[data-src]"));
    if (!vids.length) return;
    function tryLoad(v) {
      if (v.dataset.armed === "1") return;
      v.dataset.armed = "1";
      var src = v.getAttribute("data-src");
      if (!src) return;
      v.addEventListener(
        "error",
        function () {
          v.removeAttribute("src");
          v.classList.remove("is-ready");
        },
        { once: true }
      );
      v.addEventListener(
        "loadeddata",
        function () {
          v.classList.add("is-ready");
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        },
        { once: true }
      );
      v.src = src;
      v.load();
    }
    if ("IntersectionObserver" in window) {
      var vio = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) tryLoad(entry.target);
          });
        },
        { threshold: 0.15 }
      );
      vids.forEach(function (v) { vio.observe(v); });
    } else {
      vids.forEach(tryLoad);
    }
  }
  armVideos();

  // 轻微视差
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      stages.forEach(function (stage) {
        var bg = stage.querySelector(".hub-bg");
        if (!bg) return;
        var rect = stage.getBoundingClientRect();
        var vh = window.innerHeight || 1;
        if (rect.bottom < 0 || rect.top > vh) return;
        var p = (vh / 2 - (rect.top + rect.height / 2)) / vh;
        bg.style.transform = "scale(1.04) translate3d(0," + (p * 28).toFixed(2) + "px,0)";
      });
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // —— Canvas 粒子 ——
  function resizeCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    return dpr;
  }

  function spawnBubbles(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = resizeCanvas(canvas);
    var parts = [];
    for (var i = 0; i < 36; i++) {
      parts.push({
        x: Math.random(),
        y: Math.random(),
        r: 1.2 + Math.random() * 3.5,
        s: 0.00035 + Math.random() * 0.0008,
        a: 0.15 + Math.random() * 0.35,
      });
    }
    function frame() {
      var w = canvas.width;
      var h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      parts.forEach(function (p) {
        p.y -= p.s;
        if (p.y < -0.05) p.y = 1.05;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(160,230,240," + p.a + ")";
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
      });
      requestAnimationFrame(frame);
    }
    frame();
  }

  function spawnShards(canvas) {
    var ctx = canvas.getContext("2d");
    resizeCanvas(canvas);
    var parts = [];
    for (var i = 0; i < 22; i++) {
      parts.push({
        x: Math.random(),
        y: Math.random(),
        l: 8 + Math.random() * 22,
        a: Math.random() * Math.PI,
        s: 0.0002 + Math.random() * 0.0005,
        o: 0.1 + Math.random() * 0.25,
      });
    }
    function frame() {
      var w = canvas.width;
      var h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      parts.forEach(function (p) {
        p.x += Math.cos(p.a) * p.s;
        p.y += Math.sin(p.a) * p.s * 0.6;
        if (p.x < -0.1 || p.x > 1.1 || p.y < -0.1 || p.y > 1.1) {
          p.x = Math.random();
          p.y = Math.random();
        }
        var x = p.x * w;
        var y = p.y * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(p.a) * p.l, y + Math.sin(p.a) * p.l);
        ctx.strokeStyle = "rgba(255,90,110," + p.o + ")";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
      requestAnimationFrame(frame);
    }
    frame();
  }

  function spawnMotes(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = resizeCanvas(canvas);
    var parts = [];
    for (var i = 0; i < 40; i++) {
      parts.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + Math.random() * 1.8,
        vx: (Math.random() - 0.5) * 0.0004,
        vy: -0.00015 - Math.random() * 0.00035,
        a: 0.12 + Math.random() * 0.3,
      });
    }
    function frame() {
      var w = canvas.width;
      var h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      parts.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r * dpr, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(210,230,235," + p.a + ")";
        ctx.fill();
      });
      requestAnimationFrame(frame);
    }
    frame();
  }

  function spawnEmbers(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = resizeCanvas(canvas);
    var parts = [];
    for (var i = 0; i < 48; i++) {
      parts.push({
        x: 0.45 + Math.random() * 0.5,
        y: 0.4 + Math.random() * 0.6,
        r: 0.8 + Math.random() * 2.4,
        vy: -0.0004 - Math.random() * 0.0012,
        vx: (Math.random() - 0.5) * 0.0006,
        a: 0.25 + Math.random() * 0.5,
        life: Math.random(),
      });
    }
    function frame() {
      var w = canvas.width;
      var h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      parts.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.life += 0.004;
        if (p.y < 0.15 || p.life > 1) {
          p.x = 0.5 + Math.random() * 0.4;
          p.y = 0.75 + Math.random() * 0.25;
          p.life = 0;
        }
        var g = ctx.createRadialGradient(p.x * w, p.y * h, 0, p.x * w, p.y * h, p.r * 4 * dpr);
        g.addColorStop(0, "rgba(255,180,60," + p.a + ")");
        g.addColorStop(1, "rgba(255,60,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r * 4 * dpr, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(frame);
    }
    frame();
  }

  function spawnTide(canvas) {
    var ctx = canvas.getContext("2d");
    resizeCanvas(canvas);
    var t0 = 0;
    function frame() {
      t0 += 0.008;
      var w = canvas.width;
      var h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < 3; i++) {
        ctx.beginPath();
        var ybase = h * (0.62 + i * 0.08);
        ctx.moveTo(0, ybase);
        for (var x = 0; x <= w; x += 16) {
          var y = ybase + Math.sin(x * 0.008 + t0 + i) * (10 + i * 6);
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(94,200,216," + (0.08 + i * 0.04) + ")";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      requestAnimationFrame(frame);
    }
    frame();
  }

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) {
    document.querySelectorAll("canvas[data-canvas]").forEach(function (c) {
      var kind = c.getAttribute("data-canvas");
      if (kind === "bubbles") spawnBubbles(c);
      else if (kind === "shards") spawnShards(c);
      else if (kind === "motes") spawnMotes(c);
      else if (kind === "embers") spawnEmbers(c);
      else if (kind === "hero") spawnTide(c);
    });
    window.addEventListener("resize", function () {
      document.querySelectorAll("canvas.hub-canvas").forEach(resizeCanvas);
    });
  }
})();
