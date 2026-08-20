(function () {
  document.documentElement.classList.add("js");

  var hero = document.querySelector(".hero");
  if (hero) {
    requestAnimationFrame(function () {
      hero.classList.add("is-ready");
    });
  }

  var nodes = document.querySelectorAll(".chapter, .closer, .reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );
    nodes.forEach(function (n) {
      n.classList.add("reveal");
      io.observe(n);
    });
  } else {
    nodes.forEach(function (n) {
      n.classList.add("is-in");
    });
  }

  // 色温分段：滚动时红色鲨鱼胶囊滑到对应项
  var moodSeg = document.querySelector('.shark-seg[data-seg="mood"]');
  var links = moodSeg
    ? Array.prototype.slice.call(moodSeg.querySelectorAll(".shark-seg__item"))
    : [];
  var map = links
    .map(function (a) {
      var id = (a.getAttribute("href") || "").replace("#", "");
      var el = document.getElementById(id);
      return el ? { a: a, el: el } : null;
    })
    .filter(Boolean);

  function setActive() {
    if (!map.length || !window.SharkSeg) return;
    var y = window.scrollY + 120;
    var cur = map[0];
    map.forEach(function (item) {
      if (item.el.offsetTop <= y) cur = item;
    });
    if (cur) window.SharkSeg.activate(moodSeg, cur.a);
  }
  window.addEventListener("scroll", setActive, { passive: true });
  window.addEventListener("load", setActive);
  setTimeout(setActive, 50);

  var media = document.querySelector(".hero-media img");
  if (media && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.addEventListener(
      "scroll",
      function () {
        var t = Math.min(window.scrollY, 480);
        media.style.transform = "scale(1) translateY(" + t * 0.12 + "px)";
      },
      { passive: true }
    );
  }
})();
