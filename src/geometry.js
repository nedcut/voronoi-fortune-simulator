export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lpDistance(a, b, p = 2) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (p === Infinity) return Math.max(dx, dy);
  if (p === 1) return dx + dy;
  if (p === 2) return Math.hypot(dx, dy);
  if (Math.abs(p) < 1e-6) return Math.max(dx, dy);
  return (dx ** p + dy ** p) ** (1 / p);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function roundCoord(value, places = 1) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

export function samePoint(a, b, eps = 0.75) {
  return distance(a, b) <= eps;
}

export function nearlySamePoint(a, b, eps = 1e-4) {
  return distance(a, b) <= eps;
}
