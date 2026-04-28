export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
