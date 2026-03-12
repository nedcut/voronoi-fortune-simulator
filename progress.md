Original prompt: Review and audit the code.

- 2026-03-11: Audit found three confirmed issues in the visualizer: hidden site mutation/dedup inside `FortuneAlgo`, premature animation completion with queued work remaining, and frozen React HUD text during animation.
- 2026-03-11: Fix in progress. Plan is to preserve the input site set, fast-forward offscreen remaining events without dropping them, and sync HUD values through React state instead of refs-only rendering.
- 2026-03-11: Fix complete. `FortuneAlgo` now uses the exact input sites, site insertion/random generation share a visible min-distance filter, the animation loop drains or fast-forwards the remaining queue instead of truncating, and the HUD/event badge update from React state during playback.
- 2026-03-11: Verification: `npm run build` passes; browser check shows the HUD advancing from `Sweep at x = 84 · 0 events processed` to `Sweep at x = 272 · 1 events processed` after 2 seconds; console error check is clean; local algorithm checks confirm offscreen completion drains the queue and reversed site order now produces identical final edges.
