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

export function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function circumcenter(a, b, c) {
  const d = 2 * (
    a.x * (b.y - c.y) +
    b.x * (c.y - a.y) +
    c.x * (a.y - b.y)
  );
  if (Math.abs(d) < 1e-9) return null;

  const aa = a.x * a.x + a.y * a.y;
  const bb = b.x * b.x + b.y * b.y;
  const cc = c.x * c.x + c.y * c.y;

  return {
    x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d,
    y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d,
  };
}

export function buildDelaunayTriangulation(sites, eps = 1e-6) {
  if (sites.length < 2) return { triangles: [], edges: [] };
  if (sites.length === 2) {
    return {
      triangles: [],
      edges: [{
        id: "0-1",
        a: 0,
        b: 1,
        triangleIds: [],
        length: distance(sites[0], sites[1]),
      }],
    };
  }

  const minX = Math.min(...sites.map(site => site.x));
  const maxX = Math.max(...sites.map(site => site.x));
  const minY = Math.min(...sites.map(site => site.y));
  const maxY = Math.max(...sites.map(site => site.y));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const points = [
    ...sites,
    { x: midX - 20 * span, y: midY - 4 * span },
    { x: midX, y: midY + 20 * span },
    { x: midX + 20 * span, y: midY - 4 * span },
  ];
  const superIds = [sites.length, sites.length + 1, sites.length + 2];

  const makeTriangle = (a, b, c) => {
    const area2 = orientation(points[a], points[b], points[c]);
    if (Math.abs(area2) < eps) return null;
    const siteIds = area2 > 0 ? [a, b, c] : [a, c, b];
    const center = circumcenter(points[siteIds[0]], points[siteIds[1]], points[siteIds[2]]);
    if (!center) return null;
    return {
      siteIds,
      center,
      radius: distance(center, points[siteIds[0]]),
      area: Math.abs(area2) / 2,
    };
  };

  let work = [makeTriangle(superIds[0], superIds[1], superIds[2])].filter(Boolean);

  for (let pointId = 0; pointId < sites.length; pointId++) {
    const point = points[pointId];
    const bad = [];
    const keep = [];

    for (const triangle of work) {
      if (distance(point, triangle.center) <= triangle.radius + eps) bad.push(triangle);
      else keep.push(triangle);
    }

    const boundary = new Map();
    for (const triangle of bad) {
      const [a, b, c] = triangle.siteIds;
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const lo = Math.min(u, v);
        const hi = Math.max(u, v);
        const key = `${lo}-${hi}`;
        const edge = boundary.get(key);
        if (edge) edge.count += 1;
        else boundary.set(key, { a: lo, b: hi, count: 1 });
      }
    }

    const next = [...keep];
    for (const edge of boundary.values()) {
      if (edge.count !== 1) continue;
      const triangle = makeTriangle(edge.a, edge.b, pointId);
      if (triangle) next.push(triangle);
    }
    work = next;
  }

  const triangles = [];
  for (const triangle of work) {
    if (triangle.siteIds.some(index => index >= sites.length)) continue;
    triangles.push({ ...triangle, id: triangles.length });
  }

  const edges = new Map();
  const addEdge = (i, j, triangleId) => {
    const a = Math.min(i, j);
    const b = Math.max(i, j);
    const key = `${a}-${b}`;
    const edge = edges.get(key) ?? {
      id: key,
      a,
      b,
      triangleIds: [],
      length: distance(sites[a], sites[b]),
    };
    edge.triangleIds.push(triangleId);
    edges.set(key, edge);
  };
  for (const triangle of triangles) {
    const [a, b, c] = triangle.siteIds;
    addEdge(a, b, triangle.id);
    addEdge(b, c, triangle.id);
    addEdge(c, a, triangle.id);
  }
  if (!triangles.length) {
    const sorted = sites
      .map((site, index) => ({ site, index }))
      .sort((a, b) => a.site.x === b.site.x ? a.site.y - b.site.y : a.site.x - b.site.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      addEdge(sorted[i].index, sorted[i + 1].index, null);
    }
  }

  return {
    triangles,
    edges: [...edges.values()].sort((a, b) => {
      if (a.a !== b.a) return a.a - b.a;
      return a.b - b.b;
    }),
  };
}

export function isPolygonBoundaryEdge(i, j, count) {
  return Math.abs(i - j) === 1 || Math.abs(i - j) === count - 1;
}

export function buildMinimumWeightTriangulation(vertices) {
  const n = vertices.length;
  const table = Array.from({ length: n }, () => Array(n).fill(null));
  const choices = Array.from({ length: n }, () => Array(n).fill(null));
  if (n < 3) return { table, choices, diagonals: [], triangles: [], totalWeight: 0 };

  const edgeCost = (i, j) => isPolygonBoundaryEdge(i, j, n) ? 0 : distance(vertices[i], vertices[j]);

  for (let i = 0; i < n; i++) {
    table[i][i] = 0;
    if (i + 1 < n) table[i][i + 1] = 0;
  }

  for (let span = 2; span < n; span++) {
    for (let i = 0; i + span < n; i++) {
      const j = i + span;
      let best = Infinity;
      let bestK = null;
      for (let k = i + 1; k < j; k++) {
        const cost = table[i][k] + table[k][j] + edgeCost(i, k) + edgeCost(k, j);
        if (cost < best) {
          best = cost;
          bestK = k;
        }
      }
      table[i][j] = best;
      choices[i][j] = bestK;
    }
  }

  const diagonalKeys = new Set();
  const triangles = [];
  const collect = (i, j) => {
    const k = choices[i][j];
    if (k == null) return;
    triangles.push([i, k, j]);
    for (const [a, b] of [[i, k], [k, j]]) {
      if (!isPolygonBoundaryEdge(a, b, n)) {
        diagonalKeys.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
      }
    }
    collect(i, k);
    collect(k, j);
  };
  collect(0, n - 1);

  const boundaryWeight = vertices.reduce((sum, vertex, index) => {
    return sum + distance(vertex, vertices[(index + 1) % n]);
  }, 0);

  return {
    table,
    choices,
    diagonals: [...diagonalKeys].map(key => {
      const [a, b] = key.split("-").map(Number);
      return { id: key, a, b, length: distance(vertices[a], vertices[b]) };
    }),
    triangles,
    totalWeight: boundaryWeight + (table[0][n - 1] ?? 0),
    diagonalWeight: table[0][n - 1] ?? 0,
    boundaryWeight,
  };
}
