(function () {
  var audio = document.getElementById("audio");
  var btnPlay = document.getElementById("btnPlay");
  var btnPrev = document.getElementById("btnPrev");
  var btnNext = document.getElementById("btnNext");
  var btnAlt = document.getElementById("btnAlt");
  var cardMain = document.getElementById("cardArt");
  var cardPrev = document.getElementById("cardArtPrev");
  var cardStage = document.querySelector(".lyric-card-stage");
  var hint = document.getElementById("audioHint");
  var creditMeta = document.getElementById("creditMeta");
  var syncRoot = document.getElementById("syncLyrics");
  var versionSwitch = document.getElementById("versionSwitch");
  var moodRail = document.getElementById("moodRail");
  var nowPlaying = document.getElementById("nowPlaying");
  var versions = window.SUB_LYRIC_VERSIONS || window.SHARK_LYRIC_VERSIONS || {};

  var currentVer = versions["3.0"] ? "3.0" : Object.keys(versions)[0] || "2.0";
  var blocks = [];
  var cues = [];
  var flatLines = []; // {block, line, start, end, text, el}
  var idx = 0;
  var lineIdx = -1;
  var baseDuration = 234.0;
  var lyricBaseDuration = 234.0;
  var mainSrc = "";
  var usingAlt = false;
  var rafId = 0;
  var lockUntil = 0;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function ratioNow() {
    var dur =
      audio && isFinite(audio.duration) && audio.duration > 0 ? audio.duration : baseDuration;
    return dur / baseDuration;
  }

  function scaleTime(t) {
    return t * ratioNow();
  }

  function renderBlocks(ver) {
    if (!syncRoot || !ver || !ver.blocks) return;
    syncRoot.innerHTML = ver.blocks
      .map(function (b, i) {
        var lines = b.lines && b.lines.length
          ? b.lines
          : String(b.text || "")
              .split("\n")
              .filter(Boolean)
              .map(function (text, n, arr) {
                var span = (b.end - b.start) / arr.length;
                return {
                  text: text,
                  start: b.start + n * span,
                  end: n === arr.length - 1 ? b.end : b.start + (n + 1) * span,
                };
              });
        var linesHtml = lines
          .map(function (ln, li) {
            return (
              '<button type="button" class="lyric-line" data-bi="' +
              i +
              '" data-li="' +
              li +
              '" data-start="' +
              ln.start +
              '" data-end="' +
              ln.end +
              '"><span class="lyric-time">' +
              fmt(ln.start) +
              '</span><span class="lyric-text">' +
              escapeHtml(ln.text) +
              "</span></button>"
            );
          })
          .join("");
        return (
          '<article class="sync-block' +
          (i === 0 ? " is-on" : "") +
          '" id="' +
          escapeHtml(b.id) +
          '" data-start="' +
          b.start +
          '" data-end="' +
          b.end +
          '" data-art="' +
          escapeHtml(b.art) +
          '" data-glow="' +
          escapeHtml(b.glow) +
          '">' +
          '<div class="k">' +
          escapeHtml(b.k) +
          "</div>" +
          '<div class="sync-progress" aria-hidden="true"><span></span></div>' +
          '<div class="lyric-lines">' +
          linesHtml +
          "</div>" +
          "</article>"
        );
      })
      .join("");

    blocks = Array.prototype.slice.call(syncRoot.querySelectorAll(".sync-block"));
    cues = ver.blocks.map(function (b) {
      return { start: b.start, end: b.end, art: b.art, glow: b.glow, k: b.k, lines: b.lines || [] };
    });

    flatLines = [];
    blocks.forEach(function (blockEl, bi) {
      blockEl.querySelectorAll(".lyric-line").forEach(function (el, li) {
        flatLines.push({
          block: bi,
          line: li,
          start: parseFloat(el.getAttribute("data-start") || "0"),
          end: parseFloat(el.getAttribute("data-end") || "0"),
          text: (el.querySelector(".lyric-text") || el).textContent || "",
          el: el,
        });
      });
      blockEl.addEventListener("click", function (e) {
        if (e.target.closest(".lyric-line")) return;
        setActive(bi, true);
        if (audio && audio.paused) audio.play().catch(function () {});
      });
    });
    flatLines.forEach(function (item, fi) {
      item.el.addEventListener("click", function (e) {
        e.stopPropagation();
        seekToLine(fi, true);
      });
    });
  }

  function scaledCue(i) {
    var dur =
      audio && isFinite(audio.duration) && audio.duration > 0 ? audio.duration : baseDuration;
    var ratio = dur / baseDuration;
    var c = cues[i];
    var start = c.start * ratio;
    var end = c.end >= 9000 ? dur + 1 : Math.min(c.end * ratio, dur + 0.05);
    if (i === cues.length - 1) end = dur + 1;
    if (i > 0) {
      var prevEnd = cues[i - 1].end >= 9000 ? dur : cues[i - 1].end * ratio;
      start = Math.max(start, prevEnd);
    }
    return { start: start, end: end, art: c.art, glow: c.glow, k: c.k };
  }

  function applyGlow(glow) {
    if (!cardStage) return;
    cardStage.style.setProperty("--card-glow", glow);
  }

  function swapCard(art) {
    if (!cardMain || !art) return;
    if (cardMain.getAttribute("src") === art) return;
    if (cardPrev && cardStage) {
      cardPrev.src = cardMain.src;
      cardStage.classList.add("is-switching");
      cardMain.src = art;
      window.setTimeout(function () {
        cardStage.classList.remove("is-switching");
      }, 560);
    } else {
      cardMain.src = art;
    }
  }

  function syncMoodRail(i) {
    if (!moodRail) return;
    moodRail.querySelectorAll("a").forEach(function (a, n) {
      a.classList.toggle("is-on", n === i);
    });
  }

  function updateProgress(i, t) {
    blocks.forEach(function (b, n) {
      var bar = b.querySelector(".sync-progress span");
      if (!bar) return;
      if (n !== i) {
        bar.style.width = "0%";
        return;
      }
      var cue = scaledCue(i);
      var span = Math.max(0.01, cue.end - cue.start);
      var p = Math.max(0, Math.min(1, (t - cue.start) / span));
      bar.style.width = p * 100 + "%";
    });
  }

  function setActive(i, seek) {
    if (i < 0 || i >= blocks.length) return;
    idx = i;
    var cue = scaledCue(i);
    blocks.forEach(function (b, n) {
      b.classList.toggle("is-on", n === i);
    });
    swapCard(cue.art);
    applyGlow(cue.glow);
    syncMoodRail(i);
    var on = blocks[i];
    if (on && on.scrollIntoView) {
      on.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (seek && audio && isFinite(audio.duration)) {
      var target = Math.min(cue.start + 0.05, Math.max(0, audio.duration - 0.2));
      lockUntil = Date.now() + 1200;
      try {
        if (typeof audio.fastSeek === "function") audio.fastSeek(target);
        else audio.currentTime = target;
      } catch (e) {
        audio.currentTime = target;
      }
      // 跳到该段第一句
      var first = flatLines.findIndex(function (x) { return x.block === i; });
      if (first >= 0) highlightLine(first, false);
      refreshHint();
      updateProgress(i, cue.start);
    }
  }

  function highlightLine(fi, scroll) {
    if (fi < 0 || fi >= flatLines.length) return;
    lineIdx = fi;
    var item = flatLines[fi];
    flatLines.forEach(function (x, n) {
      x.el.classList.toggle("is-on", n === fi);
      x.el.classList.toggle("is-past", n < fi);
    });
    if (item.block !== idx) {
      idx = item.block;
      var cue = scaledCue(idx);
      blocks.forEach(function (b, n) {
        b.classList.toggle("is-on", n === idx);
      });
      swapCard(cue.art);
      applyGlow(cue.glow);
      syncMoodRail(idx);
    }
    if (nowPlaying) {
      nowPlaying.textContent = "正在唱 · " + item.text;
    }
    if (scroll && item.el && item.el.scrollIntoView) {
      item.el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function seekToLine(fi, play) {
    if (fi < 0 || fi >= flatLines.length) return;
    var item = flatLines[fi];
    highlightLine(fi, true);
    if (audio && isFinite(audio.duration)) {
      var target = Math.min(scaleTime(item.start) + 0.02, Math.max(0, audio.duration - 0.2));
      lockUntil = Date.now() + 1200;
      try {
        if (typeof audio.fastSeek === "function") audio.fastSeek(target);
        else audio.currentTime = target;
      } catch (e) {
        audio.currentTime = target;
      }
      refreshHint();
      updateProgress(item.block, target);
    }
    if (play && audio) audio.play().catch(function () {});
  }

  function findIndexAt(t) {
    if (!blocks.length) return 0;
    var first = scaledCue(0);
    if (t < first.start) return 0;
    for (var i = 0; i < blocks.length; i++) {
      var cue = scaledCue(i);
      if (t >= cue.start && t < cue.end) return i;
    }
    return blocks.length - 1;
  }

  function findLineAt(t) {
    if (!flatLines.length) return -1;
    var r = ratioNow();
    if (t < flatLines[0].start * r) return 0;
    for (var i = 0; i < flatLines.length; i++) {
      var a = flatLines[i].start * r;
      var b = flatLines[i].end * r;
      if (t >= a && t < b) return i;
    }
    // 段间空隙：贴最近上一句
    for (var j = flatLines.length - 1; j >= 0; j--) {
      if (t >= flatLines[j].start * r) return j;
    }
    return flatLines.length - 1;
  }

  function syncFromTime() {
    if (!audio || !blocks.length) return;
    var t = audio.currentTime || 0;
    if (Date.now() < lockUntil) {
      updateProgress(idx, Math.max(t, scaledCue(idx).start));
      return;
    }
    var found = findIndexAt(t);
    if (found !== idx) setActive(found, false);
    updateProgress(found, t);
    var fi = findLineAt(t);
    if (fi !== lineIdx) highlightLine(fi, true);
  }

  function tick() {
    syncFromTime();
    if (audio && !audio.paused && !audio.ended) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = 0;
    }
  }

  function startTick() {
    if (rafId) return;
    rafId = requestAnimationFrame(tick);
  }

  function stopTick() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function fmt(sec) {
    var s = Math.max(0, Math.round(sec || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function refreshHint() {
    if (!hint || !audio) return;
    var ver = versions[currentVer];
    var prefix = ver && ver.hintPrefix ? ver.hintPrefix + " · " : "";
    var trackLabel = usingAlt ? "备选 · " : "主轨 · ";
    if (!isFinite(audio.duration)) {
      hint.textContent = prefix + trackLabel + "加载中…";
      return;
    }
    var line = lineIdx >= 0 && flatLines[lineIdx] ? flatLines[lineIdx] : null;
    hint.textContent =
      prefix +
      trackLabel +
      "时长 " +
      fmt(audio.duration) +
      (line
        ? " · 当前句 " + fmt(scaleTime(line.start)) + "「" + line.text + "」"
        : "");
  }

  function currentVocalSrc() {
    if (usingAlt && btnAlt) {
      var alt = btnAlt.getAttribute("data-src");
      if (alt) return alt;
    }
    return mainSrc;
  }

  function loadAudio(src, keepRatio) {
    if (!audio || !src) return;
    var t = audio.currentTime || 0;
    var wasPlaying = !audio.paused;
    var ratio = keepRatio && audio.duration > 0 ? t / audio.duration : 0;
    audio.src = src;
    audio.load();
    audio.addEventListener(
      "loadedmetadata",
      function once() {
        if (keepRatio) {
          audio.currentTime = Math.min(ratio * audio.duration, Math.max(0, audio.duration - 0.05));
        } else {
          audio.currentTime = 0;
        }
        if (wasPlaying) audio.play().catch(function () {});
        refreshHint();
        syncFromTime();
      },
      { once: true }
    );
  }

  function applyVersion(verId, opts) {
    opts = opts || {};
    var ver = versions[verId];
    if (!ver) return;
    currentVer = verId;
    lyricBaseDuration = ver.baseDuration || 234;
    baseDuration = lyricBaseDuration;
    usingAlt = false;
    mainSrc = ver.audio;
    lineIdx = -1;
    if (creditMeta) creditMeta.textContent = ver.credit;
    if (btnAlt) {
      btnAlt.setAttribute("data-src", ver.alt || "");
      btnAlt.textContent = "备选 take";
      btnAlt.disabled = !ver.alt;
      btnAlt.style.opacity = ver.alt ? "" : "0.4";
    }
    if (versionSwitch) {
      versionSwitch.querySelectorAll("[data-ver]").forEach(function (btn) {
        btn.classList.toggle("is-on", btn.getAttribute("data-ver") === verId);
      });
    }
    renderBlocks(ver);
    idx = 0;
    loadAudio(ver.audio, !!opts.keepRatio);
    setActive(0, false);
    if (flatLines.length) highlightLine(0, false);
  }

  if (btnPlay && audio) {
    btnPlay.addEventListener("click", function () {
      if (audio.paused) audio.play().catch(function () {});
      else audio.pause();
    });
    audio.addEventListener("play", function () {
      btnPlay.textContent = "暂停";
      startTick();
    });
    audio.addEventListener("pause", function () {
      btnPlay.textContent = "播放";
      stopTick();
      syncFromTime();
    });
    audio.addEventListener("ended", function () {
      stopTick();
      syncFromTime();
    });
    audio.addEventListener("timeupdate", syncFromTime);
    audio.addEventListener("seeked", syncFromTime);
    audio.addEventListener("loadedmetadata", function () {
      refreshHint();
      syncFromTime();
    });
    audio.addEventListener("error", function () {
      if (hint) hint.textContent = "本地音轨尚未就绪：" + (mainSrc || "");
    });
  }

  // 上/下一句（具体歌词）
  if (btnPrev) {
    btnPrev.textContent = "上一句";
    btnPrev.addEventListener("click", function () {
      seekToLine(Math.max(0, lineIdx - 1), true);
    });
  }
  if (btnNext) {
    btnNext.textContent = "下一句";
    btnNext.addEventListener("click", function () {
      seekToLine(Math.min(flatLines.length - 1, lineIdx + 1), true);
    });
  }

  if (btnAlt && audio) {
    btnAlt.addEventListener("click", function () {
      if (!btnAlt.getAttribute("data-src")) return;
      usingAlt = !usingAlt;
      loadAudio(currentVocalSrc(), true);
      btnAlt.textContent = usingAlt ? "切回主轨" : "备选 take";
      refreshHint();
    });
  }

  if (versionSwitch) {
    versionSwitch.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-ver]");
      if (!btn) return;
      var verId = btn.getAttribute("data-ver");
      if (!verId || verId === currentVer) return;
      applyVersion(verId, { keepRatio: true });
    });
  }

  if (moodRail) {
    moodRail.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (!a) return;
      e.preventDefault();
      var href = a.getAttribute("href") || "";
      var id = href.replace("#", "");
      var i = blocks.findIndex(function (b) { return b.id === id; });
      if (i >= 0) {
        setActive(i, true);
        if (audio && audio.paused) audio.play().catch(function () {});
      }
    });
  }

  if (cardStage && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var frame = cardStage.querySelector(".tarot-frame");
    cardStage.addEventListener("pointermove", function (e) {
      if (!frame) return;
      var r = cardStage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      frame.style.transform =
        "translateY(-4px) rotateX(" + (-y * 6) + "deg) rotateY(" + (x * 8) + "deg)";
    });
    cardStage.addEventListener("pointerleave", function () {
      if (frame) frame.style.transform = "";
    });
  }

  if (versions["3.0"]) {
    applyVersion("3.0", { keepRatio: false });
  } else if (versions[currentVer]) {
    applyVersion(currentVer, { keepRatio: false });
  } else if (versions["2.0"]) {
    applyVersion("2.0", { keepRatio: false });
  }
})();
