(() => {
  "use strict";

  // ── State ────────────────────────────────
  let levelsData = [];
  let currentLevel = null;
  let currentItems = [];      // the 3 active items to find
  let foundItems = new Set();  // indices within currentItems
  let totalFound = 0;
  let remainingPool = [];      // items not yet used in this level
  let selectedTag = null;      // currently hovered/active tag index
  let imageNaturalW = 0;
  let imageNaturalH = 0;

  // ── DOM refs ─────────────────────────────
  const menuScreen       = document.getElementById("menu-screen");
  const gameScreen        = document.getElementById("game-screen");
  const levelGrid         = document.getElementById("level-grid");
  const levelTitle        = document.getElementById("level-title");
  const scoreSpan         = document.getElementById("score");
  const gameImage         = document.getElementById("game-image");
  const imageContainer    = document.getElementById("image-container");
  const highlightsLayer   = document.getElementById("highlights-layer");
  const clickFeedback     = document.getElementById("click-feedback");
  const itemsList         = document.getElementById("items-list");
  const roundComplete     = document.getElementById("round-complete");
  const levelComplete     = document.getElementById("level-complete");
  const backBtn           = document.getElementById("back-btn");
  const nextRoundBtn      = document.getElementById("next-round-btn");
  const backToMenuBtn     = document.getElementById("back-to-menu-btn");

  // ── Boot ─────────────────────────────────
  async function init() {
    const res = await fetch("data/levels.json");
    const data = await res.json();
    levelsData = data.levels;
    renderMenu();
    bindGlobal();
    bindImportModal();
  }

  // ── Menu ─────────────────────────────────
  function renderMenu() {
    levelGrid.innerHTML = "";

    // Built-in levels
    levelsData.forEach((level) => {
      levelGrid.appendChild(buildLevelCard(level, false));
    });

    // Custom levels from localStorage
    const custom = CustomLevels.getAll();
    custom.forEach((level) => {
      levelGrid.appendChild(buildLevelCard(level, true));
    });
  }

  function buildLevelCard(level, isCustom) {
    const card = document.createElement("div");
    card.className = "level-card" + (isCustom ? " custom" : "");
    card.innerHTML = `
      <div class="level-card-placeholder">${level.emoji || "🖼️"}</div>
      <div class="level-card-body">
        <div class="level-card-name">${level.name}</div>
        <div class="level-card-info">${level.items.length} hidden items</div>
      </div>`;
    if (isCustom) {
      const delBtn = document.createElement("button");
      delBtn.className = "level-card-delete";
      delBtn.innerHTML = "&times;";
      delBtn.title = "Remove custom level";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        CustomLevels.remove(level.name);
        renderMenu();
      });
      card.appendChild(delBtn);
    }
    card.addEventListener("click", () => startLevel(level));
    return card;
  }

  // ── Import Modal ─────────────────────────
  function bindImportModal() {
    const importBtn       = document.getElementById("import-level-btn");
    const importModal     = document.getElementById("import-modal");
    const importTextarea  = document.getElementById("import-textarea");
    const importError     = document.getElementById("import-error");
    const importConfirm   = document.getElementById("import-confirm-btn");
    const importCancel    = document.getElementById("import-cancel-btn");

    if (!importBtn) return;

    importBtn.addEventListener("click", () => {
      importTextarea.value = "";
      importError.textContent = "";
      importModal.classList.remove("hidden");
      setTimeout(() => importTextarea.focus(), 50);
    });

    importCancel.addEventListener("click", () => importModal.classList.add("hidden"));
    importModal.addEventListener("click", (e) => {
      if (e.target === importModal) importModal.classList.add("hidden");
    });

    importConfirm.addEventListener("click", () => {
      importError.textContent = "";
      const result = CustomLevels.parse(importTextarea.value);
      if (!result.ok) {
        importError.textContent = result.error;
        return;
      }
      CustomLevels.save(result.level);
      importModal.classList.add("hidden");
      renderMenu();
    });
  }

  // ── Start Level ──────────────────────────
  function startLevel(level) {
    currentLevel = level;
    totalFound = 0;
    scoreSpan.textContent = "0";
    remainingPool = [...Array(level.items.length).keys()]; // indices
    shuffle(remainingPool);

    levelTitle.textContent = level.name;
    gameImage.src = level.image;

    // Generate a placeholder canvas if image fails to load
    gameImage.onerror = () => {
      generatePlaceholderImage(level);
    };

    gameImage.onload = () => {
      imageNaturalW = gameImage.naturalWidth;
      imageNaturalH = gameImage.naturalHeight;
      pickNewRound();
    };

    // If image is cached
    if (gameImage.complete && gameImage.naturalWidth > 0) {
      imageNaturalW = gameImage.naturalWidth;
      imageNaturalH = gameImage.naturalHeight;
      pickNewRound();
    }

    showScreen(gameScreen);
  }

  // ── Generate placeholder image with items drawn on it ──
  function generatePlaceholderImage(level) {
    const w = level.width || 450;
    const h = level.height || 710;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#1a3a5c");
    grad.addColorStop(0.5, "#2a5a3c");
    grad.addColorStop(1, "#3a2a5c");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Draw random shapes as scene decoration
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `hsla(${Math.random() * 360}, 40%, 50%, 0.15)`;
      ctx.beginPath();
      ctx.ellipse(
        Math.random() * w, Math.random() * h,
        20 + Math.random() * 60, 20 + Math.random() * 60,
        0, 0, Math.PI * 2
      );
      ctx.fill();
    }

    // Title
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, w, 44);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(level.name, w / 2, 22);

    gameImage.src = canvas.toDataURL();
    imageNaturalW = w;
    imageNaturalH = h;
    pickNewRound();
  }

  // ── Pick 3 new items for a round ─────────
  function pickNewRound() {
    foundItems.clear();
    selectedTag = null;

    if (remainingPool.length === 0) {
      showLevelComplete();
      return;
    }

    const count = Math.min(3, remainingPool.length);
    currentItems = remainingPool.splice(0, count).map(i => currentLevel.items[i]);

    renderItems();
    renderHighlights();
    roundComplete.classList.add("hidden");
    levelComplete.classList.add("hidden");
  }

  // ── Render item tags below image ─────────
  function renderItems() {
    itemsList.innerHTML = "";
    currentItems.forEach((item, idx) => {
      const tag = document.createElement("div");
      tag.className = "item-tag";
      tag.textContent = item.name;
      tag.dataset.index = idx;

      // Desktop: hover to show highlight
      tag.addEventListener("mouseenter", () => {
        if (!foundItems.has(idx)) {
          selectedTag = idx;
          showHighlight(idx);
        }
      });

      tag.addEventListener("mouseleave", () => {
        if (selectedTag === idx) {
          selectedTag = null;
          hideHighlight(idx);
        }
      });

      // Mobile: tap to toggle highlight
      tag.addEventListener("touchstart", (e) => {
        e.preventDefault();
        if (foundItems.has(idx)) return;
        if (selectedTag === idx) {
          selectedTag = null;
          hideHighlight(idx);
          tag.classList.remove("active");
        } else {
          // Hide previous
          if (selectedTag !== null) {
            hideHighlight(selectedTag);
            const prevTag = itemsList.querySelector(`[data-index="${selectedTag}"]`);
            if (prevTag) prevTag.classList.remove("active");
          }
          selectedTag = idx;
          showHighlight(idx);
          tag.classList.add("active");
        }
      });

      itemsList.appendChild(tag);
    });
  }

  // ── Render highlight boxes (hidden initially) ──
  function renderHighlights() {
    highlightsLayer.innerHTML = "";
    currentItems.forEach((item, idx) => {
      const box = document.createElement("div");
      box.className = "highlight-box";
      box.dataset.index = idx;
      positionHighlight(box, item);
      highlightsLayer.appendChild(box);
    });
  }

  function positionHighlight(box, item) {
    const displayW = gameImage.clientWidth;
    const displayH = gameImage.clientHeight;
    const scaleX = displayW / imageNaturalW;
    const scaleY = displayH / imageNaturalH;

    box.style.left   = `${item.x * scaleX}px`;
    box.style.top    = `${item.y * scaleY}px`;
    box.style.width  = `${item.width * scaleX}px`;
    box.style.height = `${item.height * scaleY}px`;
  }

  function showHighlight(idx) {
    const box = highlightsLayer.querySelector(`[data-index="${idx}"]`);
    if (box && !box.classList.contains("found")) {
      box.classList.add("visible");
    }
  }

  function hideHighlight(idx) {
    const box = highlightsLayer.querySelector(`[data-index="${idx}"]`);
    if (box && !box.classList.contains("found")) {
      box.classList.remove("visible");
    }
  }

  // ── Image click handler ──────────────────
  function handleImageClick(e) {
    const rect = gameImage.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const displayW = gameImage.clientWidth;
    const displayH = gameImage.clientHeight;
    const scaleX = displayW / imageNaturalW;
    const scaleY = displayH / imageNaturalH;

    // Normalize click to image-natural coordinates
    const natX = clickX / scaleX;
    const natY = clickY / scaleY;

    // Check which unfound item was clicked
    let hitIdx = -1;
    for (let i = 0; i < currentItems.length; i++) {
      if (foundItems.has(i)) continue;
      const it = currentItems[i];
      // Add some tolerance (10px in natural coords)
      const tol = 10;
      if (
        natX >= it.x - tol && natX <= it.x + it.width + tol &&
        natY >= it.y - tol && natY <= it.y + it.height + tol
      ) {
        hitIdx = i;
        break;
      }
    }

    if (hitIdx >= 0) {
      markFound(hitIdx);
      showClickFeedback(clickX, clickY, true);
    } else {
      showClickFeedback(clickX, clickY, false);
    }
  }

  function markFound(idx) {
    foundItems.add(idx);
    totalFound++;
    scoreSpan.textContent = totalFound;

    // Update tag
    const tag = itemsList.querySelector(`[data-index="${idx}"]`);
    if (tag) tag.classList.add("found");

    // Hide highlight for the found item
    const box = highlightsLayer.querySelector(`[data-index="${idx}"]`);
    if (box) {
      box.classList.remove("visible");
    }

    // Check round complete — auto-advance instantly
    if (foundItems.size === currentItems.length) {
      if (remainingPool.length === 0) {
        showLevelComplete();
      } else {
        // Small delay so the player sees the last "found" tag before items swap
        setTimeout(() => pickNewRound(), 400);
      }
    }
  }

  function showClickFeedback(x, y, correct) {
    clickFeedback.className = "click-feedback";
    clickFeedback.style.left = `${x}px`;
    clickFeedback.style.top = `${y}px`;
    clickFeedback.classList.add(correct ? "correct" : "wrong");

    // Reset animation
    void clickFeedback.offsetWidth;
    setTimeout(() => {
      clickFeedback.className = "click-feedback hidden";
    }, 500);
  }

  // ── Overlays ─────────────────────────────
  function showRoundComplete() {
    roundComplete.classList.remove("hidden");
  }

  function showLevelComplete() {
    levelComplete.classList.remove("hidden");
  }

  // ── Navigation ───────────────────────────
  function showScreen(screen) {
    menuScreen.classList.remove("active");
    gameScreen.classList.remove("active");
    screen.classList.add("active");
  }

  function goToMenu() {
    roundComplete.classList.add("hidden");
    levelComplete.classList.add("hidden");
    highlightsLayer.innerHTML = "";
    showScreen(menuScreen);
  }

  // ── Bind Events ──────────────────────────
  function bindGlobal() {
    backBtn.addEventListener("click", goToMenu);
    backToMenuBtn.addEventListener("click", goToMenu);
    nextRoundBtn.addEventListener("click", () => pickNewRound());
    imageContainer.addEventListener("click", handleImageClick);

    // Touch support for the image
    imageContainer.addEventListener("touchend", (e) => {
      if (e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const fakeEvent = { clientX: touch.clientX, clientY: touch.clientY };
      handleImageClick(fakeEvent);
    });

    // Re-position highlights on resize
    window.addEventListener("resize", () => {
      if (!currentLevel) return;
      currentItems.forEach((item, idx) => {
        const box = highlightsLayer.querySelector(`[data-index="${idx}"]`);
        if (box) positionHighlight(box, item);
      });
    });
  }

  // ── Util ─────────────────────────────────
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ── Go ───────────────────────────────────
  init();
})();
