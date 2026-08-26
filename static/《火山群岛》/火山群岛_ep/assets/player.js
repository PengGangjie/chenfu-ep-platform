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
  var nowPlaying = document.getElementById("nowPlaying");
  var versionSwitch = document.getElementById("versionSwitch");
  var versions = window.EP_LYRIC_VERSIONS || {};
  var currentVer = window.EP_DEFAULT_VER || Object.keys(versions)[0];
  var blocks = [];
  var flatLines = [];
  var idx = 0;
  var lineIdx = -1;
  var baseDuration = 300;
  var mainSrc = "";
  var usingAlt = false;
  var rafId = 0;
  var lockUntil = 0;
  var lockedLineIdx = -1;

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function ratioNow() {
    var dur = audio && isFinite(audio.duration) && audio.duration > 0 ? audio.duration : baseDuration;
    return dur / baseDuration;
  }
  function scaleTime(t) { return t * ratioNow(); }
  function fmt(sec) {
    var s = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }
  function fmtMs(sec) {
    var x = Math.max(0, sec || 0);
    var m = Math.floor(x / 60);
    var r = x - m * 60;
    var whole = Math.floor(r);
    var frac = Math.round((r - whole) * 10);
    if (frac === 10) { whole += 1; frac = 0; }
    return m + ":" + (whole < 10 ? "0" : "") + whole + "." + frac;
  }
  function isStageDir(text) {
    return /^[（(]/.test(String(text || ""));
  }

  function renderBlocks(ver) {
    if (!syncRoot || !ver || !ver.blocks) return;
    syncRoot.innerHTML = ver.blocks.map(function (b, i) {
      var lines = (b.lines || []).map(function (ln, j) {
        var stage = isStageDir(ln.text) ? " is-stage" : "";
        return (
          '<button type="button" class="sync-line lyric-line' + stage + '" data-bi="' + i +
          '" data-li="' + j +
          '" data-start="' + ln.start +
          '" data-end="' + ln.end +
          '" title="点击跳到此句并对对照">' +
          '<span class="lyric-time">' + fmtMs(ln.start) + "</span>" +
          '<span class="lyric-text">' + escapeHtml(ln.text) + "</span>" +
          "</button>"
        );
      }).join("");
      return (
        '<section class="sync-block" id="' + b.id + '" data-i="' + i + '">' +
        '<p class="sync-k">' + escapeHtml(b.k) + " · " + fmt(b.start) + "</p>" +
        '<div class="sync-text lyric-lines">' + (lines || escapeHtml(b.text).replace(/\n/g, "<br/>")) + "</div>" +
        "</section>"
      );
    }).join("");

    syncRoot.querySelectorAll(".sync-line").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.closest(".lyric-heart")) return;
        e.preventDefault();
        e.stopPropagation();
        var bi = +el.getAttribute("data-bi");
        var li = +el.getAttribute("data-li");
        seekToLine(bi, li, true);
      });
    });
    syncRoot.querySelectorAll(".sync-block").forEach(function (el) {
      el.addEventListener("click", function (e) {
        if (e.target.closest(".sync-line")) return;
        if (e.target.closest(".lyric-heart")) return;
        var bi = +el.getAttribute("data-i");
        seekToLine(bi, 0, true);
      });
    });
    if (window.chenfuOnLyricsRendered) window.chenfuOnLyricsRendered();
  }

  function flatIndexOf(bi, li) {
    for (var i = 0; i < flatLines.length; i++) {
      if (flatLines[i].bi === bi && flatLines[i].li === li) return i;
    }
    return -1;
  }

  function seekToLine(bi, li, play) {
    var b = blocks[bi];
    if (!b || !b.lines || !b.lines[li]) return;
    var t = b.lines[li].start;
    var fi = flatIndexOf(bi, li);
    lockedLineIdx = fi;
    lockUntil = Date.now() + 2800;
    audio.currentTime = scaleTime(t);
    if (play && audio.paused) audio.play();
    updateUI();
  }

  function applyVersion(id, keepTime) {
    var ver = versions[id];
    if (!ver) return;
    currentVer = id;
    blocks = ver.blocks || [];
    flatLines = [];
    blocks.forEach(function (b, bi) {
      (b.lines || []).forEach(function (ln, li) {
        flatLines.push({
          bi: bi,
          li: li,
          start: ln.start,
          end: ln.end,
          text: ln.text,
          art: b.art || b.card || "",
          glow: b.glow || b.tint || "",
          k: b.k,
          stage: isStageDir(ln.text),
        });
      });
    });
    blocks.forEach(function (b) {
      if (!b.art && b.card) b.art = b.card;
      if (!b.glow && b.tint) b.glow = b.tint;
    });
    baseDuration = ver.baseDuration || 300;
    mainSrc = ver.audio;
    usingAlt = false;
    if (btnAlt) {
      btnAlt.dataset.src = ver.alt || "";
      btnAlt.style.display = ver.alt ? "" : "none";
      btnAlt.textContent = "备选 B";
    }
    if (creditMeta) creditMeta.textContent = ver.credit || "";
    if (hint) hint.textContent = (ver.hintPrefix || "") + " · 逐句时码可点跳";
    renderBlocks(ver);
    if (versionSwitch) {
      versionSwitch.querySelectorAll("[data-ver]").forEach(function (btn) {
        btn.classList.toggle("is-on", btn.getAttribute("data-ver") === id);
      });
    }
    var t = keepTime && audio ? audio.currentTime : 0;
    if (audio && mainSrc) {
      audio.src = mainSrc;
      audio.load();
      if (keepTime) {
        audio.addEventListener("loadedmetadata", function once() {
          audio.removeEventListener("loadedmetadata", once);
          audio.currentTime = Math.min(t, audio.duration || t);
        });
      }
    }
    setCard(blocks[0]);
    updateUI();
  }

  function setCard(b) {
    if (!b) return;
    var art = b.art || b.card || "";
    var glow = b.glow || b.tint || "";
    if (cardStage && glow) cardStage.style.setProperty("--card-glow", glow);
    if (!cardMain || !art) return;
    if ((cardMain.getAttribute("src") || "") === art) return;
    if (cardPrev && cardStage) {
      cardPrev.src = cardMain.getAttribute("src") || art;
      cardStage.classList.add("is-switching");
      cardMain.src = art;
      window.setTimeout(function () {
        cardStage.classList.remove("is-switching");
      }, 560);
    } else {
      cardMain.src = art;
    }
  }

  function findIndexAt(t) {
    var raw = t / ratioNow();
    if (Date.now() < lockUntil && lockedLineIdx >= 0) return lockedLineIdx;

    // 优先落在 [start, end)
    for (var i = 0; i < flatLines.length; i++) {
      if (raw >= flatLines[i].start && raw < flatLines[i].end) return i;
    }
    // 句间空隙：取最近一句（不倒退到已结束的舞台标注）
    var best = -1;
    var bestDist = 1e9;
    for (var j = 0; j < flatLines.length; j++) {
      var fl = flatLines[j];
      if (fl.stage && raw > fl.end) continue;
      var mid = (fl.start + fl.end) / 2;
      var d = Math.abs(raw - mid);
      if (raw >= fl.start - 0.35 && d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    if (best >= 0) return best;
    for (var k = flatLines.length - 1; k >= 0; k--) {
      if (raw >= flatLines[k].start) return k;
    }
    return flatLines.length ? 0 : -1;
  }

  function updateUI() {
    if (!audio) return;
    var t = audio.currentTime || 0;
    var li = findIndexAt(t);
    lineIdx = li;
    if (li >= 0) {
      var fl = flatLines[li];
      idx = fl.bi;
      setCard(blocks[idx]);
      if (nowPlaying) {
        if (fl.stage) {
          nowPlaying.textContent = "间奏 · " + fl.text + " · " + fmtMs(scaleTime(fl.start));
        } else {
          nowPlaying.textContent = "正在唱 · " + fmtMs(scaleTime(fl.start)) + " · " + fl.text;
        }
      }
      syncRoot.querySelectorAll(".sync-line").forEach(function (el) {
        var on = +el.getAttribute("data-bi") === fl.bi && +el.getAttribute("data-li") === fl.li;
        el.classList.toggle("is-on", on);
        el.classList.toggle("is-locked", on && Date.now() < lockUntil);
      });
      syncRoot.querySelectorAll(".sync-block").forEach(function (el) {
        el.classList.toggle("is-on", +el.getAttribute("data-i") === fl.bi);
      });
      var onEl = syncRoot.querySelector(".sync-line.is-on");
      if (onEl) {
        var r = onEl.getBoundingClientRect();
        var pr = syncRoot.getBoundingClientRect();
        if (r.top < pr.top + 40 || r.bottom > pr.bottom - 40) {
          onEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }
    if (btnPlay) btnPlay.textContent = audio.paused ? "播放" : "暂停";
  }

  function tick() {
    updateUI();
    rafId = requestAnimationFrame(tick);
  }

  if (btnPlay) btnPlay.addEventListener("click", function () {
    if (audio.paused) audio.play(); else audio.pause();
    updateUI();
  });
  if (btnPrev) btnPrev.addEventListener("click", function () {
    if (lineIdx > 0) seekToLine(flatLines[lineIdx - 1].bi, flatLines[lineIdx - 1].li, true);
  });
  if (btnNext) btnNext.addEventListener("click", function () {
    if (lineIdx >= 0 && lineIdx < flatLines.length - 1) {
      seekToLine(flatLines[lineIdx + 1].bi, flatLines[lineIdx + 1].li, true);
    }
  });
  if (btnAlt) btnAlt.addEventListener("click", function () {
    var alt = btnAlt.dataset.src;
    if (!alt) return;
    var t = audio.currentTime;
    usingAlt = !usingAlt;
    audio.src = usingAlt ? alt : mainSrc;
    audio.load();
    audio.addEventListener("loadedmetadata", function once() {
      audio.removeEventListener("loadedmetadata", once);
      audio.currentTime = t;
      audio.play();
    });
    btnAlt.textContent = usingAlt ? "主轨 A" : "备选 B";
  });
  if (versionSwitch) {
    versionSwitch.querySelectorAll("[data-ver]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        applyVersion(btn.getAttribute("data-ver"), true);
      });
    });
  }
  audio.addEventListener("play", function () {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  });
  audio.addEventListener("pause", function () {
    cancelAnimationFrame(rafId);
    updateUI();
  });
  applyVersion(currentVer, false);
})();
