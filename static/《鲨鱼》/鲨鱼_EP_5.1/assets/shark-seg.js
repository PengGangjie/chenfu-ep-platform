(function () {
  function moveThumb(seg, active) {
    if (!seg || !active) return;
    var thumb = seg.querySelector(".shark-seg__thumb");
    if (!thumb) return;
    var pad = parseFloat(getComputedStyle(seg).paddingLeft) || 4;
    var left = active.offsetLeft;
    var width = active.offsetWidth;
    thumb.style.width = width + "px";
    thumb.style.transform = "translateX(" + left + "px)";
    // 若还没设过 left 基准，用 padding 校正：offsetLeft 已含相对定位
    void pad;
  }

  function activate(seg, item, opts) {
    opts = opts || {};
    var items = Array.prototype.slice.call(seg.querySelectorAll(".shark-seg__item"));
    items.forEach(function (el) {
      el.classList.toggle("is-on", el === item);
    });
    moveThumb(seg, item);
    if (opts.scrollIntoView && item && item.scrollIntoView) {
      item.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }

  function bindSeg(seg) {
    var items = Array.prototype.slice.call(seg.querySelectorAll(".shark-seg__item"));
    if (!items.length) return;
    if (!seg.querySelector(".shark-seg__thumb")) {
      var t = document.createElement("span");
      t.className = "shark-seg__thumb";
      t.setAttribute("aria-hidden", "true");
      seg.insertBefore(t, seg.firstChild);
    }
    var initial = seg.querySelector(".shark-seg__item.is-on") || items[0];
    requestAnimationFrame(function () {
      activate(seg, initial);
    });

    items.forEach(function (item) {
      item.addEventListener("click", function () {
        activate(seg, item, { scrollIntoView: true });
      });
    });

    window.addEventListener(
      "resize",
      function () {
        var on = seg.querySelector(".shark-seg__item.is-on") || items[0];
        moveThumb(seg, on);
      },
      { passive: true }
    );
  }

  function initAll() {
    document.querySelectorAll(".shark-seg").forEach(bindSeg);
  }

  // 暴露给页面：按滚动同步色温分段
  window.SharkSeg = {
    activate: activate,
    moveThumb: moveThumb,
    bind: bindSeg,
    refresh: initAll,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
