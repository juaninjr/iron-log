// The "Knife" brand — this app's shared wordmark and knife glyph. One
// module since both the gate screen, the main header, the wheel page's
// backdrop title, the figurine grid, and the skip-to-log button's hover
// state all need the same two pieces of markup, not five copies of it.
// See CLAUDE.md ("What this is") for why the app is also branded/known as
// Knife (kknniiffee.com).

export const SITE_NAME = "Knife";

// Two-layer ghost-vibrate wordmark: a solid, fully-opaque base plus an
// absolutely-positioned 30%-opacity "ghost" copy that jitters via the
// knife-vibrate keyframes (style.css). Ported from ffoorrkk.com's own
// title animation (see ~/Desktop/ffoorrkk-title-animation.md) — a fast
// ±1px diagonal jitter, not a rotation-based wobble. `modifier` picks the
// size/context via a `.knife-logo--<modifier>` class (see style.css:
// `--brand` for the gate/header wordmark, `--bg` for the large low-opacity
// wheel-page backdrop).
export function renderKnifeTitle(modifier) {
  const cls = modifier ? `knife-logo knife-logo--${modifier}` : "knife-logo";
  return `
    <span class="${cls}">
      <span class="knife-logo-base">${SITE_NAME}</span>
      <span class="knife-logo-ghost" aria-hidden="true">${SITE_NAME}</span>
    </span>
  `;
}

// One small hand-rolled knife glyph (blade + handle) — the shape both
// the gate's figurine cells and the crossed-knives icon are built from.
function knifeGlyphPath() {
  return `<path d="M20 80 L62 38" stroke="currentColor" stroke-width="9" stroke-linecap="round" fill="none"/>
    <path d="M58 34 L82 18 A7 7 0 0 1 90 26 L74 50 Z" fill="currentColor"/>`;
}

// A single knife, colorable — used for the gate's figurine cells.
export function knifeGlyphSvg(color) {
  return `<svg viewBox="0 0 100 100" style="color:${color}" aria-hidden="true">${knifeGlyphPath()}</svg>`;
}

// Two knives crossed into an X — used for #skipToLogBtn's hover state.
export function crossedKnivesSvg(color) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <g transform="rotate(45 50 50)" style="color:${color}">${knifeGlyphPath()}</g>
    <g transform="rotate(-45 50 50)" style="color:${color}">${knifeGlyphPath()}</g>
  </svg>`;
}
