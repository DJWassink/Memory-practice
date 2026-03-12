// ── Shared localStorage helpers for custom levels ──
// Used by both game.js and editor.html

const STORAGE_KEY = "findit_custom_levels";

const CustomLevels = {
  /** Get all custom levels from localStorage */
  getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /** Save a level (adds or updates by matching name) */
  save(level) {
    const levels = this.getAll();
    const idx = levels.findIndex(l => l.name === level.name);
    if (idx >= 0) {
      levels[idx] = level;
    } else {
      levels.push(level);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
    return levels;
  },

  /** Delete a level by name */
  remove(name) {
    const levels = this.getAll().filter(l => l.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
    return levels;
  },

  /** Parse & validate a level JSON string. Returns { ok, level?, error? } */
  parse(jsonStr) {
    let parsed;
    try {
      parsed = JSON.parse(jsonStr.trim());
    } catch (err) {
      return { ok: false, error: "Invalid JSON: " + err.message };
    }

    // Accept full levels.json wrapper
    let level = parsed;
    if (parsed.levels && Array.isArray(parsed.levels)) {
      level = parsed.levels[0];
    }

    if (!level || !Array.isArray(level.items)) {
      return { ok: false, error: 'Expected a level object with an "items" array.' };
    }

    for (const it of level.items) {
      if (typeof it.name !== "string" || typeof it.x !== "number" || typeof it.y !== "number"
          || typeof it.width !== "number" || typeof it.height !== "number") {
        return { ok: false, error: "Each item needs: name, x, y, width, height." };
      }
    }

    return { ok: true, level };
  }
};
