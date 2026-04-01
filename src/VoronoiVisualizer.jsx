import { useState, useRef, useCallback, useEffect, useMemo } from "react";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * VORONOI DIAGRAM — Fortune's Algorithm Visualizer
 * 
 * Left-to-right CONTINUOUS sweep. The display sweep position moves smoothly.
 * Algorithm events are processed when the sweep reaches them.
 * ═══════════════════════════════════════════════════════════════════════════
 */

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function normalizeWheelDelta(delta, deltaMode) {
  if (deltaMode === 1) return delta * 18;
  if (deltaMode === 2) {
    const page = typeof window === "undefined" ? 800 : window.innerHeight * 0.85;
    return delta * page;
  }
  return delta;
}

function circumcenter(a, b, c) {
  const D = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(D) < 1e-10) return null;
  const ux = ((a.x*a.x+a.y*a.y)*(b.y-c.y)+(b.x*b.x+b.y*b.y)*(c.y-a.y)+(c.x*c.x+c.y*c.y)*(a.y-b.y))/D;
  const uy = ((a.x*a.x+a.y*a.y)*(c.x-b.x)+(b.x*b.x+b.y*b.y)*(a.x-c.x)+(c.x*c.x+c.y*c.y)*(b.x-a.x))/D;
  return { x: ux, y: uy };
}

function parabolaX(focus, sweepX, y) {
  const d = 2 * (focus.x - sweepX);
  if (Math.abs(d) < 1e-10) return -1e8;
  return ((y - focus.y) ** 2) / d + (focus.x + sweepX) / 2;
}

function breakpointY(upper, lower, sweepX) {
  const a = upper, b = lower, s = sweepX;
  const da = a.x - s, db = b.x - s;
  if (Math.abs(da) < 1e-10 && Math.abs(db) < 1e-10) return (a.y + b.y) / 2;
  if (Math.abs(da) < 1e-10) return a.y;
  if (Math.abs(db) < 1e-10) return b.y;
  const A = 1/(2*da) - 1/(2*db);
  const B = -a.y/da + b.y/db;
  const C = a.y*a.y/(2*da) - b.y*b.y/(2*db) + (a.x-b.x)/2;
  if (Math.abs(A) < 1e-10) return Math.abs(B) < 1e-10 ? (a.y+b.y)/2 : -C/B;
  const disc = B*B - 4*A*C;
  if (disc < 0) return (a.y + b.y) / 2;
  const y1 = (-B - Math.sqrt(disc)) / (2*A);
  const y2 = (-B + Math.sqrt(disc)) / (2*A);
  return a.x < b.x ? Math.min(y1, y2) : Math.max(y1, y2);
}

function samePoint(a, b, eps = 0.75) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= eps;
}

function mergeCollinearDebugEdges(a, b, eps = 0.75) {
  if (a.siteAId !== b.siteAId || a.siteBId !== b.siteBId) return null;

  const a1 = { x: a.x1, y: a.y1 };
  const a2 = { x: a.x2, y: a.y2 };
  const b1 = { x: b.x1, y: b.y1 };
  const b2 = { x: b.x2, y: b.y2 };

  const sharedMatch = samePoint(a1, b1, eps) ? { shared: a1, otherA: a2, otherB: b2 }
    : samePoint(a1, b2, eps) ? { shared: a1, otherA: a2, otherB: b1 }
    : samePoint(a2, b1, eps) ? { shared: a2, otherA: a1, otherB: b2 }
    : samePoint(a2, b2, eps) ? { shared: a2, otherA: a1, otherB: b1 }
    : null;

  if (!sharedMatch) return null;

  const va = {
    x: sharedMatch.otherA.x - sharedMatch.shared.x,
    y: sharedMatch.otherA.y - sharedMatch.shared.y,
  };
  const vb = {
    x: sharedMatch.otherB.x - sharedMatch.shared.x,
    y: sharedMatch.otherB.y - sharedMatch.shared.y,
  };
  const lenA = Math.hypot(va.x, va.y);
  const lenB = Math.hypot(vb.x, vb.y);
  if (lenA < eps || lenB < eps) return null;

  const cross = Math.abs(va.x * vb.y - va.y * vb.x);
  const dot = va.x * vb.x + va.y * vb.y;
  if (cross > eps * (lenA + lenB) || dot >= 0) return null;

  const sourceIds = [...new Set([...a.sourceIds, ...b.sourceIds])].sort((x, y) => x - y);
  return {
    id: `edge-${sourceIds.join("-")}`,
    sourceIds,
    siteAId: a.siteAId,
    siteBId: a.siteBId,
    leftId: a.siteAId,
    rightId: a.siteBId,
    x1: Math.round(sharedMatch.otherA.x * 10) / 10,
    y1: Math.round(sharedMatch.otherA.y * 10) / 10,
    x2: Math.round(sharedMatch.otherB.x * 10) / 10,
    y2: Math.round(sharedMatch.otherB.y * 10) / 10,
  };
}

function mergeDebugEdges(edges) {
  const byPair = new Map();
  for (const edge of edges) {
    const key = `${edge.siteAId}-${edge.siteBId}`;
    const group = byPair.get(key);
    if (group) group.push(edge);
    else byPair.set(key, [edge]);
  }

  const merged = [];
  for (const group of byPair.values()) {
    const work = [...group];
    let changed = true;
    while (changed) {
      changed = false;
      outer:
      for (let i = 0; i < work.length; i++) {
        for (let j = i + 1; j < work.length; j++) {
          const next = mergeCollinearDebugEdges(work[i], work[j]);
          if (!next) continue;
          work.splice(j, 1);
          work.splice(i, 1, next);
          changed = true;
          break outer;
        }
      }
    }
    merged.push(...work);
  }

  return merged.sort((a, b) => {
    if (a.siteAId !== b.siteAId) return a.siteAId - b.siteAId;
    if (a.siteBId !== b.siteBId) return a.siteBId - b.siteBId;
    return a.sourceIds[0] - b.sourceIds[0];
  });
}

function roundCoord(value, places = 1) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function nearlySamePoint(a, b, eps = 1e-4) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= eps;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

function dedupePolygon(points, eps = 1e-4) {
  const deduped = [];
  for (const point of points) {
    if (!deduped.length || !nearlySamePoint(deduped[deduped.length - 1], point, eps)) {
      deduped.push(point);
    }
  }
  if (deduped.length > 1 && nearlySamePoint(deduped[0], deduped[deduped.length - 1], eps)) {
    deduped.pop();
  }
  return deduped;
}

function clipPolygonAgainstBisector(polygon, site, other, eps = 1e-7) {
  if (!polygon.length) return [];
  const a = other.x - site.x;
  const b = other.y - site.y;
  const c = (other.x * other.x + other.y * other.y - site.x * site.x - site.y * site.y) / 2;
  const inside = point => a * point.x + b * point.y <= c + eps;
  const intersect = (p1, p2) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const denom = a * dx + b * dy;
    if (Math.abs(denom) < eps) return { x: p2.x, y: p2.y };
    const t = clamp((c - a * p1.x - b * p1.y) / denom, 0, 1);
    return { x: p1.x + dx * t, y: p1.y + dy * t };
  };

  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentInside = inside(current);
    const nextInside = inside(next);
    if (currentInside && nextInside) {
      result.push(next);
    } else if (currentInside && !nextInside) {
      result.push(intersect(current, next));
    } else if (!currentInside && nextInside) {
      result.push(intersect(current, next));
      result.push(next);
    }
  }

  return dedupePolygon(result, 1e-4);
}

function buildClippedVoronoiCells(sites, W, H) {
  const bounds = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];

  return sites
    .map(site => {
      let polygon = bounds.map(point => ({ ...point }));
      for (const other of sites) {
        if (other.id === site.id) continue;
        polygon = clipPolygonAgainstBisector(polygon, site, other);
        if (polygon.length < 3) break;
      }

      polygon = dedupePolygon(polygon, 1e-4);
      if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 1e-3) return null;

      return {
        faceId: `f${site.id}`,
        site,
        points: polygon,
      };
    })
    .filter(Boolean);
}

function boundaryPerimeterT(point, W, H, orientation = "cw", eps = 1e-4) {
  const x = clamp(point.x, 0, W);
  const y = clamp(point.y, 0, H);
  const perimeter = 2 * (W + H);
  let value;

  if (Math.abs(y) <= eps) value = x;
  else if (Math.abs(x - W) <= eps) value = W + y;
  else if (Math.abs(y - H) <= eps) value = W + H + (W - x);
  else value = 2 * W + H + (H - y);

  return orientation === "cw" ? value : (perimeter - value) % perimeter;
}

function buildDerivedDCEL(activeSites, W, H) {
  if (!activeSites.length) {
    return {
      vertexCount: 0,
      halfEdgeCount: 0,
      faceCount: 0,
      vertices: [],
      faces: [],
      halfEdges: [],
    };
  }

  const cells = buildClippedVoronoiCells(activeSites, W, H);
  const vertices = [];
  const vertexByKey = new Map();
  const faces = [];
  const halfEdges = [];
  const faceById = new Map();

  const getVertexId = point => {
    const key = `${roundCoord(point.x, 4)},${roundCoord(point.y, 4)}`;
    const existing = vertexByKey.get(key);
    if (existing != null) return existing;
    const id = vertices.length;
    vertices.push({
      id,
      x: roundCoord(point.x),
      y: roundCoord(point.y),
      incidentEdge: null,
    });
    vertexByKey.set(key, id);
    return id;
  };

  for (const cell of cells) {
    const face = {
      id: cell.faceId,
      label: `Face s${cell.site.id}`,
      siteId: cell.site.id,
      siteX: roundCoord(cell.site.x),
      siteY: roundCoord(cell.site.y),
      outerComponent: null,
      innerComponents: [],
      isOuter: false,
      polygon: cell.points.map(point => ({
        x: roundCoord(point.x),
        y: roundCoord(point.y),
      })),
    };
    faces.push(face);
    faceById.set(face.id, face);

    const vertexIds = cell.points.map(getVertexId);
    const edgeIds = [];
    for (let i = 0; i < vertexIds.length; i++) {
      const origin = vertexIds[i];
      const destination = vertexIds[(i + 1) % vertexIds.length];
      const start = cell.points[i];
      const end = cell.points[(i + 1) % cell.points.length];
      const id = halfEdges.length;
      halfEdges.push({
        id,
        label: `e${id}`,
        origin,
        destination,
        twin: null,
        incidentFace: face.id,
        next: null,
        prev: null,
        leftSiteId: cell.site.id,
        rightSiteId: null,
        x1: roundCoord(start.x),
        y1: roundCoord(start.y),
        x2: roundCoord(end.x),
        y2: roundCoord(end.y),
        isOuterBoundaryTwin: false,
      });
      if (vertices[origin].incidentEdge == null) vertices[origin].incidentEdge = id;
      edgeIds.push(id);
    }

    for (let i = 0; i < edgeIds.length; i++) {
      const current = edgeIds[i];
      halfEdges[current].next = edgeIds[(i + 1) % edgeIds.length];
      halfEdges[current].prev = edgeIds[(i - 1 + edgeIds.length) % edgeIds.length];
    }
    face.outerComponent = edgeIds[0] ?? null;
  }

  const directedEdgeMap = new Map();
  for (const edge of halfEdges) {
    const key = `${edge.origin}:${edge.destination}`;
    const reverseKey = `${edge.destination}:${edge.origin}`;
    const reverse = directedEdgeMap.get(reverseKey);
    if (reverse?.length) {
      const twinId = reverse.pop();
      edge.twin = twinId;
      halfEdges[twinId].twin = edge.id;
      edge.rightSiteId = faceById.get(halfEdges[twinId].incidentFace)?.siteId ?? null;
      halfEdges[twinId].rightSiteId = faceById.get(edge.incidentFace)?.siteId ?? null;
      if (!reverse.length) directedEdgeMap.delete(reverseKey);
      continue;
    }
    const bucket = directedEdgeMap.get(key);
    if (bucket) bucket.push(edge.id);
    else directedEdgeMap.set(key, [edge.id]);
  }

  const outerFace = {
    id: "f_out",
    label: "Outer Face",
    siteId: null,
    siteX: null,
    siteY: null,
    outerComponent: null,
    innerComponents: [],
    isOuter: true,
    polygon: null,
  };
  const outerEdgeIds = [];

  for (const edge of halfEdges.slice()) {
    if (edge.twin != null) continue;
    const id = halfEdges.length;
    const twin = {
      id,
      label: `e${id}`,
      origin: edge.destination,
      destination: edge.origin,
      twin: edge.id,
      incidentFace: outerFace.id,
      next: null,
      prev: null,
      leftSiteId: null,
      rightSiteId: faceById.get(edge.incidentFace)?.siteId ?? null,
      x1: edge.x2,
      y1: edge.y2,
      x2: edge.x1,
      y2: edge.y1,
      isOuterBoundaryTwin: true,
    };
    halfEdges.push(twin);
    edge.twin = id;
    if (vertices[twin.origin].incidentEdge == null) vertices[twin.origin].incidentEdge = id;
    outerEdgeIds.push(id);
  }

  if (outerEdgeIds.length) {
    const perimeter = 2 * (W + H);
    const scoreOrientation = orientation => outerEdgeIds.reduce((score, edgeId) => {
      const edge = halfEdges[edgeId];
      const origin = vertices[edge.origin];
      const destination = vertices[edge.destination];
      const delta = (boundaryPerimeterT(destination, W, H, orientation) - boundaryPerimeterT(origin, W, H, orientation) + perimeter) % perimeter;
      return score + (delta <= perimeter / 2 ? 1 : -1);
    }, 0);
    const orientation = scoreOrientation("cw") >= scoreOrientation("ccw") ? "cw" : "ccw";
    outerEdgeIds.sort((a, b) => {
      const edgeA = halfEdges[a];
      const edgeB = halfEdges[b];
      return boundaryPerimeterT(vertices[edgeA.origin], W, H, orientation) - boundaryPerimeterT(vertices[edgeB.origin], W, H, orientation);
    });
    for (let i = 0; i < outerEdgeIds.length; i++) {
      const current = outerEdgeIds[i];
      halfEdges[current].next = outerEdgeIds[(i + 1) % outerEdgeIds.length];
      halfEdges[current].prev = outerEdgeIds[(i - 1 + outerEdgeIds.length) % outerEdgeIds.length];
    }
    outerFace.innerComponents = [outerEdgeIds[0]];
  }

  faces.push(outerFace);

  return {
    vertexCount: vertices.length,
    halfEdgeCount: halfEdges.length,
    faceCount: faces.length,
    vertices,
    faces,
    halfEdges,
  };
}

const SITE=0, CIRCLE=1;

function makeEventDebugId(evt) {
  return evt.type === SITE
    ? `site-${evt.site.id}-${Math.round(evt.x * 10)}`
    : `circle-${Math.round(evt.x * 10)}-${Math.round(evt.center.x * 10)}-${Math.round(evt.center.y * 10)}-${Math.round(evt.radius * 10)}`;
}

class FortuneAlgo {
  constructor(sites, W, H) {
    this.W = W; this.H = H;
    this.sites = sites.map((s,i) => ({ x:s.x, y:s.y, id:i }));
    this.sweepX = 0; this.done = false; this.stepCount = 0; this.lastEvent = null;
    this.queue = this.sites.map(s => ({ type:SITE, x:s.x, site:s }));
    this.queue.sort((a,b) => a.x - b.x);
    this.root = null; this.edges = []; this.vertices = [];
    this.activeCircles = [];
    this.nextArcDebugId = 0;
    this.nextEdgeDebugId = 0;
    this.eventHistory = [];
  }

  makeArc(site, extra = {}) {
    return {
      debugId: this.nextArcDebugId++,
      site,
      prev: null,
      next: null,
      circleEvent: null,
      e0: null,
      e1: null,
      ...extra,
    };
  }

  makeEdge(extra = {}) {
    return {
      debugId: this.nextEdgeDebugId++,
      start: null,
      end: null,
      left: null,
      right: null,
      topSite: null,
      botSite: null,
      ...extra,
    };
  }

  insertEvent(evt) {
    let lo=0, hi=this.queue.length;
    while (lo < hi) { const m=(lo+hi)>>1; if (this.queue[m].x < evt.x) lo=m+1; else hi=m; }
    this.queue.splice(lo, 0, evt);
  }

  findArc(y) {
    let a = this.root;
    let iter = 0;
    while (a && iter < 5000) {
      iter++;
      let top = a.prev ? breakpointY(a.prev.site, a.site, this.sweepX) : -1e9;
      let bot = a.next ? breakpointY(a.site, a.next.site, this.sweepX) : 1e9;
      if (y < top - 1e-6) { a = a.prev; continue; }
      if (y > bot + 1e-6) { a = a.next; continue; }
      return a;
    }
    // Fallback: linear scan for closest arc
    if (!a) return this.root;
    let best = this.root, bestDist = Infinity;
    let scan = this.root; iter = 0;
    while (scan && iter < 5000) {
      iter++;
      const mid = scan.prev
        ? (scan.next
          ? (breakpointY(scan.prev.site, scan.site, this.sweepX) + breakpointY(scan.site, scan.next.site, this.sweepX)) / 2
          : breakpointY(scan.prev.site, scan.site, this.sweepX))
        : (scan.next ? breakpointY(scan.site, scan.next.site, this.sweepX) : 0);
      const d = Math.abs(y - mid);
      if (d < bestDist) { bestDist = d; best = scan; }
      scan = scan.next;
    }
    return best;
  }

  invalidate(arc) { if (arc?.circleEvent) { arc.circleEvent.invalid = true; arc.circleEvent = null; } }

  checkCircle(arc) {
    if (!arc?.prev || !arc?.next) return;
    const a=arc.prev.site, b=arc.site, c=arc.next.site;
    // Check for duplicate sites
    if (a.id === b.id || b.id === c.id || a.id === c.id) return;
    const cross = (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    if (cross >= 0) return;
    // Reject nearly-collinear triples (|cross| very small relative to distances)
    const abLen = dist(a, b), bcLen = dist(b, c);
    if (Math.abs(cross) < 1e-4 * abLen * bcLen) return;
    const ctr = circumcenter(a, b, c);
    if (!ctr) return;
    const r = dist(ctr, a);
    // Reject circumcenters far outside the bounding box — these are degenerate
    const margin = Math.max(this.W, this.H) * 3;
    if (ctr.x < -margin || ctr.x > this.W + margin || ctr.y < -margin || ctr.y > this.H + margin) return;
    const ex = ctr.x + r;
    if (ex < this.sweepX - 1e-6) return;
    const evt = { type:CIRCLE, x:ex, center:ctr, radius:r, arc, invalid:false };
    arc.circleEvent = evt;
    this.insertEvent(evt);
  }

  handleSite(evt) {
    const s = evt.site;
    if (!this.root) { this.root = this.makeArc(s); return; }
    let arc = this.findArc(s.y);
    if (!arc) { arc = this.root; while (arc.next) arc = arc.next; }
    this.invalidate(arc);
    const a = this.makeArc(arc.site, { prev:arc.prev, e0:arc.e0 });
    const b = this.makeArc(s, { prev:a });
    const c = this.makeArc(arc.site, { prev:b, next:arc.next, e1:arc.e1 });
    a.next = b; b.next = c;
    if (arc.prev) arc.prev.next = a;
    if (arc.next) arc.next.prev = c;
    if (this.root === arc) this.root = a;
    const sp = { x: parabolaX(arc.site, this.sweepX, s.y), y: s.y };
    // Edge between top arc (a) and new arc (b): separates a.site (above) from b.site (below)
    const e1 = this.makeEdge({ start:{...sp}, end:null, left:arc.site, right:s, topSite:arc.site, botSite:s });
    // Edge between new arc (b) and bottom arc (c): separates b.site (above) from c.site=arc.site (below)
    const e2 = this.makeEdge({ start:{...sp}, end:null, left:s, right:arc.site, topSite:s, botSite:arc.site });
    this.edges.push(e1, e2);
    a.e1 = e1; b.e0 = e1; b.e1 = e2; c.e0 = e2;
    this.checkCircle(a); this.checkCircle(c);
  }

  handleCircle(evt) {
    if (evt.invalid) return false;
    const arc = evt.arc, v = { ...evt.center };
    this.vertices.push(v);
    this.activeCircles.push({ center:evt.center, radius:evt.radius, step:this.stepCount, sweepX:evt.x });
    const prev = arc.prev, next = arc.next;
    this.invalidate(prev); this.invalidate(next);
    if (arc.e0) arc.e0.end = { ...v };
    if (arc.e1) arc.e1.end = { ...v };
    if (prev) prev.next = next;
    if (next) next.prev = prev;
    if (this.root === arc) this.root = next;
    // New edge: prev is above, next is below in beachline order
    const e = this.makeEdge({ start:{...v}, end:null, left:prev?.site, right:next?.site,
                topSite:prev?.site, botSite:next?.site });
    this.edges.push(e);
    if (prev) prev.e1 = e;
    if (next) next.e0 = e;
    this.checkCircle(prev); this.checkCircle(next);
    return true;
  }

  advanceTo(x) {
    this.sweepX = x;
    let processed = 0;
    while (this.queue.length && this.queue[0].x <= x + 0.01) {
      const evt = this.queue.shift();
      this.sweepX = evt.x; this.lastEvent = evt; this.stepCount++;
      if (evt.type === SITE) this.handleSite(evt);
      else if (!this.handleCircle(evt)) continue;
      this.eventHistory.push({
        id: makeEventDebugId(evt),
        type: evt.type === SITE ? "site" : "circle",
        x: Math.round(evt.x * 10) / 10,
        rawX: evt.x,
      });
      processed++;
    }
    this.sweepX = x;
    if (!this.queue.length && x > this.W + 50) {
      this.finish(); this.done = true;
    }
    return processed;
  }

  nextEventX() {
    for (const e of this.queue) {
      if (e.type === SITE || !e.invalid) return e.x;
    }
    return null;
  }

  getQueueLength() {
    let count = 0;
    for (const e of this.queue) {
      if (e.type === SITE || !e.invalid) count++;
    }
    return count;
  }

  finish() {
    // For each unfinished edge, project it by tracing the breakpoint direction.
    // Use two sample sweep positions to determine the direction the breakpoint is moving.
    const bigX = this.W + this.H;
    for (const e of this.edges) {
      if (e.end) continue;
      if (!e.topSite || !e.botSite) continue;

      // Sample breakpoint at two sweep positions to get direction
      const sx1 = Math.max(e.topSite.x, e.botSite.x) + 1;
      const sx2 = sx1 + 200;
      const by1 = breakpointY(e.topSite, e.botSite, sx1);
      const bx1 = parabolaX(e.topSite, sx1, by1);
      const by2 = breakpointY(e.topSite, e.botSite, sx2);
      const bx2 = parabolaX(e.topSite, sx2, by2);

      if (!isFinite(bx1) || !isFinite(by1) || !isFinite(bx2) || !isFinite(by2)) {
        // Fallback: perpendicular bisector direction
        const mx = (e.topSite.x + e.botSite.x)/2, my = (e.topSite.y + e.botSite.y)/2;
        const dx = e.botSite.y - e.topSite.y, dy = -(e.botSite.x - e.topSite.x);
        const len = Math.hypot(dx,dy);
        if (len < 1e-10) continue;
        // Pick direction away from start
        const dirX = dx/len, dirY = dy/len;
        const testX = e.start.x + dirX * 10, testY = e.start.y + dirY * 10;
        // Check which direction goes more to the right
        if (testX < e.start.x) {
          e.end = { x: e.start.x - dirX*bigX, y: e.start.y - dirY*bigX };
        } else {
          e.end = { x: e.start.x + dirX*bigX, y: e.start.y + dirY*bigX };
        }
        continue;
      }

      // Direction from breakpoint motion
      let dx = bx2 - bx1, dy = by2 - by1;
      let len = Math.hypot(dx, dy);
      if (len < 1e-10) {
        // Perpendicular bisector fallback
        dx = e.botSite.y - e.topSite.y;
        dy = -(e.botSite.x - e.topSite.x);
        len = Math.hypot(dx, dy);
        if (len < 1e-10) continue;
      }
      e.end = { x: e.start.x + (dx/len)*bigX, y: e.start.y + (dy/len)*bigX };
    }
  }

  getArcsAt(renderX) {
    const arcs = []; let a = this.root;
    const sx = renderX;
    while (a) {
      const top = a.prev ? breakpointY(a.prev.site, a.site, sx) : -60;
      const bot = a.next ? breakpointY(a.site, a.next.site, sx) : this.H + 60;
      if (a.site.x < sx + 1) {
        arcs.push({
          arcId: a.debugId,
          site:a.site,
          yTop:Math.max(-60,top),
          yBot:Math.min(this.H+60,bot),
        });
      }
      a = a.next;
    }
    return arcs;
  }

  getEdges() {
    const bound = Math.max(this.W, this.H) * 2;
    const rawEdges = this.edges
      .filter(e => {
        if (!e.end) return false;
        if (e.left?.id == null || e.right?.id == null) return false;
        if (Math.abs(e.start.x) > bound || Math.abs(e.start.y) > bound) return false;
        if (Math.abs(e.end.x) > bound || Math.abs(e.end.y) > bound) {
          return this._clipTest(e.start.x, e.start.y, e.end.x, e.end.y, -50, -50, this.W+50, this.H+50);
        }
        return true;
      })
      .map(e => {
        const siteAId = Math.min(e.left.id, e.right.id);
        const siteBId = Math.max(e.left.id, e.right.id);
        return {
          id: `edge-${e.debugId}`,
          sourceIds: [e.debugId],
          siteAId,
          siteBId,
          leftId: siteAId,
          rightId: siteBId,
          x1: e.start.x,
          y1: e.start.y,
          x2: e.end.x,
          y2: e.end.y,
        };
      });

    return mergeDebugEdges(rawEdges).map(edge => ({
      x1: edge.x1,
      y1: edge.y1,
      x2: edge.x2,
      y2: edge.y2,
    }));
  }

  _clipTest(x1,y1,x2,y2,xn,yn,xx,yx) {
    const I=0,L=1,R=2,B=4,T=8;
    function c(x,y){ let r=I; if(x<xn)r|=L;else if(x>xx)r|=R; if(y<yn)r|=T;else if(y>yx)r|=B; return r; }
    let c1=c(x1,y1),c2=c(x2,y2);
    for(let i=0;i<20;i++){
      if(!(c1|c2))return true; if(c1&c2)return false;
      const o=c1||c2; let x,y;
      if(o&B){x=x1+(x2-x1)*(yx-y1)/(y2-y1);y=yx;}
      else if(o&T){x=x1+(x2-x1)*(yn-y1)/(y2-y1);y=yn;}
      else if(o&R){y=y1+(y2-y1)*(xx-x1)/(x2-x1);x=xx;}
      else{y=y1+(y2-y1)*(xn-x1)/(x2-x1);x=xn;}
      if(o===c1){x1=x;y1=y;c1=c(x1,y1);}else{x2=x;y2=y;c2=c(x2,y2);}
    } return false;
  }
  getPending() { return this.queue.filter(e=>e.type===CIRCLE&&!e.invalid).map(e=>({center:e.center,radius:e.radius,x:e.x})); }

  getBeachlineList() {
    const arcs = []; let a = this.root; let iter = 0;
    while (a && iter < 5000) { iter++; arcs.push({ siteId:a.site.id, siteX:a.site.x, siteY:a.site.y }); a = a.next; }
    return arcs;
  }

  getBeachlineDebug(renderX) {
    return buildBeachlineTreeDebug(this.getArcsAt(renderX), renderX);
  }

  getDCEL() {
    const activeSites = this.sites.filter(site => site.x <= this.sweepX + 0.01);
    return buildDerivedDCEL(activeSites, this.W, this.H);
  }

  getQueueContents() {
    return this.queue.filter(e=>e.type===SITE||!e.invalid).map(e=>({
      id: makeEventDebugId(e),
      type:e.type===SITE?"site":"circle",
      x:Math.round(e.x*10)/10,
      rawX:e.x,
      siteId:e.type===SITE?e.site.id:null,
      siteX:e.type===SITE?Math.round(e.site.x*10)/10:null,
      siteY:e.type===SITE?Math.round(e.site.y*10)/10:null,
      centerX:e.type===CIRCLE?Math.round(e.center.x*10)/10:null,
      centerY:e.type===CIRCLE?Math.round(e.center.y*10)/10:null,
      radius:e.type===CIRCLE?Math.round(e.radius*10)/10:null,
      arcSiteId:e.type===CIRCLE?e.arc?.site?.id ?? null:null,
      tripleSiteIds:e.type===CIRCLE
        ? [e.arc?.prev?.site?.id ?? null, e.arc?.site?.id ?? null, e.arc?.next?.site?.id ?? null]
        : null,
    }));
  }

  getEventHistory() {
    return this.eventHistory.slice();
  }

  // Get edges that are growing (unfinished) with their current breakpoint position
  getGrowingEdges(renderSweepX) {
    const results = [];
    for (const e of this.edges) {
      if (e.end) continue;
      if (!e.topSite || !e.botSite) continue;
      // Both sites must be behind the sweep
      if (e.topSite.x > renderSweepX || e.botSite.x > renderSweepX) continue;
      const by = breakpointY(e.topSite, e.botSite, renderSweepX);
      const bx = parabolaX(e.topSite, renderSweepX, by);
      if (!isFinite(bx) || !isFinite(by)) continue;
      if (Math.abs(bx) > 5000 || Math.abs(by) > 5000) continue;
      if (!this._clipTest(e.start.x, e.start.y, bx, by, -60, -60, this.W+60, this.H+60)) continue;
      // Also reject if the start point is way outside bounds
      if (Math.abs(e.start.x) > 5000 || Math.abs(e.start.y) > 5000) continue;
      results.push({ x1:e.start.x, y1:e.start.y, x2:bx, y2:by });
    }
    return results;
  }
}

function appendSites(existing, candidates, minDistance = 8) {
  const next = [...existing];
  for (const candidate of candidates) {
    let tooClose = false;
    for (const site of next) {
      if (Math.hypot(site.x - candidate.x, site.y - candidate.y) < minDistance) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) next.push(candidate);
  }
  return next;
}

function completeAlgorithm(algo, W) {
  let steps = 0;
  while (!algo.done && steps < 50000) {
    const nextX = algo.nextEventX();
    if (nextX == null) {
      algo.advanceTo(W + 200);
      break;
    }
    algo.advanceTo(nextX + 0.1);
    steps++;
  }
  algo.finish();
  algo.done = true;
}

function computeStatic(sites, W, H) {
  if (sites.length < 2) return [];
  const a = new FortuneAlgo(sites, W, H);
  completeAlgorithm(a, W);
  return a.getEdges();
}

function clipLine(x1,y1,x2,y2,xn,yn,xx,yx) {
  const I=0,L=1,R=2,B=4,T=8;
  function c(x,y){ let r=I; if(x<xn)r|=L;else if(x>xx)r|=R; if(y<yn)r|=T;else if(y>yx)r|=B; return r; }
  let c1=c(x1,y1),c2=c(x2,y2);
  for(let i=0;i<20;i++){
    if(!(c1|c2))return[x1,y1,x2,y2]; if(c1&c2)return null;
    const o=c1||c2; let x,y;
    if(o&B){x=x1+(x2-x1)*(yx-y1)/(y2-y1);y=yx;}
    else if(o&T){x=x1+(x2-x1)*(yn-y1)/(y2-y1);y=yn;}
    else if(o&R){y=y1+(y2-y1)*(xx-x1)/(x2-x1);x=xx;}
    else{y=y1+(y2-y1)*(xn-x1)/(x2-x1);x=xn;}
    if(o===c1){x1=x;y1=y;c1=c(x1,y1);}else{x2=x;y2=y;c2=c(x2,y2);}
  } return null;
}

const THEMES = {
  dark: {
    bg: "#0b1120", pageBg: "#080d19",
    gridDot: "rgba(30,41,59,0.7)",
    previewEdge: "rgba(100,116,139,0.2)",
    edgeStroke: "rgba(226,232,240,0.75)", growingEdge: "rgba(226,232,240,0.4)",
    sweepLine: "#38bdf8", sweepGlow: "rgba(56,189,248,", sweepText: "rgba(56,189,248,0.6)",
    vertexFill: "rgba(226,232,240,0.85)",
    siteInactive: "#334155", siteDot: "rgba(255,255,255,0.9)", siteDotInactive: "#475569",
    emptyText: "#334155", emptySubtext: "#1e293b",
    text: "#e2e8f0", textMuted: "#94a3b8", textDim: "#64748b", textDimmer: "#475569",
    accent: "#38bdf8", heading: "#f1f5f9",
    panelBg: "#111827", panelBorder: "#1e293b",
    btnBg: "#0b1120", btnBorder: "#334155", btnText: "#94a3b8",
    btnAccBg: "#38bdf8", btnAccBorder: "#38bdf8", btnAccText: "#0b1120",
    pillBg: "#111827", pillBorder: "#1e293b",
    shadow: "0 20px 50px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.03)",
    eventSiteBg: "rgba(56,189,248,0.12)", eventSiteBorder: "rgba(56,189,248,0.3)", eventSiteText: "#7dd3fc",
    eventCircleBg: "rgba(245,158,11,0.12)", eventCircleBorder: "rgba(245,158,11,0.3)", eventCircleText: "#fcd34d",
    circleRgb: "148,163,184", circleDotRgb: "148,163,184",
    toggleSweep: "#38bdf8", toggleBeach: "#c084fc", toggleCircle: "#94a3b8", toggleEdge: "#e2e8f0",
  },
  light: {
    bg: "#f8fafc", pageBg: "#e2e8f0",
    gridDot: "rgba(148,163,184,0.3)",
    previewEdge: "rgba(100,116,139,0.25)",
    edgeStroke: "rgba(30,41,59,0.7)", growingEdge: "rgba(30,41,59,0.35)",
    sweepLine: "#0284c7", sweepGlow: "rgba(2,132,199,", sweepText: "rgba(2,132,199,0.7)",
    vertexFill: "rgba(30,41,59,0.85)",
    siteInactive: "#cbd5e1", siteDot: "rgba(255,255,255,0.95)", siteDotInactive: "#94a3b8",
    emptyText: "#94a3b8", emptySubtext: "#cbd5e1",
    text: "#1e293b", textMuted: "#475569", textDim: "#64748b", textDimmer: "#94a3b8",
    accent: "#0284c7", heading: "#0f172a",
    panelBg: "#ffffff", panelBorder: "#cbd5e1",
    btnBg: "#f1f5f9", btnBorder: "#cbd5e1", btnText: "#475569",
    btnAccBg: "#0284c7", btnAccBorder: "#0284c7", btnAccText: "#ffffff",
    pillBg: "#ffffff", pillBorder: "#cbd5e1",
    shadow: "0 10px 30px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.5)",
    eventSiteBg: "rgba(2,132,199,0.1)", eventSiteBorder: "rgba(2,132,199,0.3)", eventSiteText: "#0284c7",
    eventCircleBg: "rgba(148,163,184,0.1)", eventCircleBorder: "rgba(148,163,184,0.3)", eventCircleText: "#475569",
    circleRgb: "51,65,85", circleDotRgb: "51,65,85",
    toggleSweep: "#0284c7", toggleBeach: "#9333ea", toggleCircle: "#64748b", toggleEdge: "#334155",
  },
};

const COLS = [
  "#ef6461","#60a5fa","#4ade80","#facc15","#c084fc",
  "#f472b6","#34d399","#fb923c","#818cf8","#f87171",
  "#2dd4bf","#a3e635","#e879f9","#fbbf24","#67e8f9",
  "#a78bfa","#fb7185","#86efac","#fcd34d","#93c5fd",
];
function col(i){ return COLS[i%COLS.length]; }

function makeHudState(algo, sweepX) {
  return {
    sweepX: roundCoord(sweepX, 2),
    stepCount: algo ? algo.stepCount : null,
    queueLength: algo ? algo.getQueueLength() : null,
    vertices: algo ? algo.vertices.length : null,
    lastEventType: algo?.lastEvent?.type ?? null,
  };
}

function sameHudState(a, b) {
  return a.sweepX === b.sweepX &&
    a.stepCount === b.stepCount &&
    a.queueLength === b.queueLength &&
    a.vertices === b.vertices &&
    a.lastEventType === b.lastEventType;
}

function makeSidebarFocus(kind, id, payload = {}) {
  return { kind, id, ...payload };
}

function sameSidebarFocus(a, b) {
  return a?.kind === b?.kind && a?.id === b?.id;
}

function hasSidebarFocus(list, focus) {
  return list?.some(item => sameSidebarFocus(item, focus)) ?? false;
}

function dedupeSidebarFocuses(list) {
  const seen = new Set();
  const next = [];
  for (const focus of list ?? []) {
    if (!focus) continue;
    const key = `${focus.kind}:${focus.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(focus);
  }
  return next;
}

function buildAllSidebarFocuses(panelData) {
  const focuses = [];

  if (panelData.beach?.tree?.nodes?.length) {
    for (const node of panelData.beach.tree.nodes) {
      focuses.push(makeSidebarFocus("beach-node", node.id));
    }
  }

  if (panelData.dcel?.vertices?.length) {
    for (const vertex of panelData.dcel.vertices) {
      focuses.push(makeSidebarFocus("dcel-vertex", `vertex-${vertex.id}`, { ...vertex, vertexId: vertex.id }));
    }
  }

  if (panelData.dcel?.faces?.length) {
    for (const face of panelData.dcel.faces) {
      focuses.push(makeSidebarFocus("dcel-face", `face-${face.id}`, { ...face, faceId: face.id }));
    }
  }

  if (panelData.dcel?.halfEdges?.length) {
    for (const edge of panelData.dcel.halfEdges) {
      focuses.push(makeSidebarFocus("dcel-half-edge", `half-edge-${edge.id}`, { ...edge, halfEdgeId: edge.id }));
    }
  }

  return dedupeSidebarFocuses(focuses);
}

function buildBeachlineTreeDebug(arcs, sweepX) {
  if (!arcs.length) {
    return { arcs: [], breakpoints: [], tree: null, orderSummary: "" };
  }

  const arcItems = arcs.map((arc, index) => ({
    id: `leaf-${arc.arcId}`,
    kind: "leaf",
    label: `s${arc.site.id}`,
    spanStart: index,
    spanEnd: index,
    leafIndex: index,
    arcId: arc.arcId,
    siteId: arc.site.id,
    siteX: arc.site.x,
    siteY: arc.site.y,
    yTop: arc.yTop,
    yBot: arc.yBot,
    site: arc.site,
  }));

  const breakpoints = [];
  for (let i = 0; i < arcItems.length - 1; i++) {
    const upperSite = arcItems[i].site;
    const lowerSite = arcItems[i + 1].site;
    const y = breakpointY(upperSite, lowerSite, sweepX);
    const x = parabolaX(upperSite, sweepX, y);
    breakpoints.push({
      id: `break-${arcItems[i].arcId}-${arcItems[i + 1].arcId}`,
      index: i,
      x,
      y,
      upperSiteId: upperSite.id,
      lowerSiteId: lowerSite.id,
      label: `(s${lowerSite.id},s${upperSite.id})`,
    });
  }

  const nodesById = {};
  for (const leaf of arcItems) {
    nodesById[leaf.id] = {
      ...leaf,
      depth: 0,
      siteIds: [leaf.siteId],
      leftId: null,
      rightId: null,
      boundaryBreakpointIndices: [leaf.leafIndex - 1, leaf.leafIndex].filter(
        index => index >= 0 && index < breakpoints.length
      ),
    };
  }

  const buildNode = (spanStart, spanEnd) => {
    if (spanStart === spanEnd) return arcItems[spanStart].id;

    // Build a balanced teaching tree from the ordered breakpoint sequence.
    const breakpointIndex = Math.floor((spanStart + spanEnd - 1) / 2);
    const breakpoint = breakpoints[breakpointIndex];
    const leftId = buildNode(spanStart, breakpointIndex);
    const rightId = buildNode(breakpointIndex + 1, spanEnd);
    const nodeId = `node-${leftId}-${breakpoint.lowerSiteId}-${breakpoint.upperSiteId}-${rightId}`;

    nodesById[nodeId] = {
      id: nodeId,
      kind: "internal",
      label: breakpoint.label,
      spanStart,
      spanEnd,
      splitIndex: breakpointIndex,
      breakpointIndex,
      leftId,
      rightId,
      depth: 0,
      siteIds: [...new Set(arcItems.slice(spanStart, spanEnd + 1).map(arc => arc.siteId))],
      boundaryBreakpointIndices: [spanStart - 1, spanEnd].filter(
        index => index >= 0 && index < breakpoints.length
      ),
    };

    return nodeId;
  };

  const rootId = buildNode(0, arcItems.length - 1);

  let maxDepth = 0;
  const assignDepth = (nodeId, depth) => {
    const node = nodesById[nodeId];
    if (!node) return;
    node.depth = depth;
    if (depth > maxDepth) maxDepth = depth;
    if (node.leftId) assignDepth(node.leftId, depth + 1);
    if (node.rightId) assignDepth(node.rightId, depth + 1);
  };
  assignDepth(rootId, 0);

  return {
    arcs: arcItems,
    breakpoints,
    orderSummary: arcItems.map(arc => arc.label).join(" -> "),
    tree: {
      rootId,
      maxDepth,
      nodes: Object.values(nodesById),
      nodesById,
    },
  };
}

function getTreeNodeBox(node) {
  const charWidth = node.kind === "leaf" ? 7.2 : 6.5;
  const horizontalPadding = node.kind === "leaf" ? 22 : 18;
  const width = Math.max(node.kind === "leaf" ? 42 : 58, horizontalPadding + node.label.length * charWidth);
  return { width, height: node.kind === "leaf" ? 26 : 28 };
}

function layoutBeachlineTree(tree) {
  if (!tree?.rootId) return null;

  const leafGap = 84;
  const rowGap = 66;
  const padX = 28;
  const padY = 22;
  const positions = {};
  const leaves = tree.nodes
    .filter(node => node.kind === "leaf")
    .sort((a, b) => a.leafIndex - b.leafIndex);

  leaves.forEach((leaf, index) => {
    positions[leaf.id] = {
      x: padX + index * leafGap,
      y: padY + leaf.depth * rowGap,
    };
  });

  const placeInternal = nodeId => {
    if (positions[nodeId]) return positions[nodeId];
    const node = tree.nodesById[nodeId];
    const left = placeInternal(node.leftId);
    const right = placeInternal(node.rightId);
    positions[nodeId] = {
      x: (left.x + right.x) / 2,
      y: padY + node.depth * rowGap,
    };
    return positions[nodeId];
  };
  placeInternal(tree.rootId);

  const renderedNodes = tree.nodes.map(node => {
    const box = getTreeNodeBox(node);
    return {
      ...node,
      ...positions[node.id],
      boxWidth: box.width,
      boxHeight: box.height,
    };
  });

  const width = Math.max(220, padX * 2 + Math.max(0, leaves.length - 1) * leafGap);
  const height = padY * 2 + tree.maxDepth * rowGap + 40;

  const nodesById = {};
  for (const node of renderedNodes) nodesById[node.id] = node;

  return { width, height, nodes: renderedNodes, nodesById };
}

function getParabolaSampleCount(arc, sweepX) {
  const span = Math.max(0, arc.yBot - arc.yTop);
  const directrixGap = Math.max(2, Math.abs(arc.site.x - sweepX));
  const baseSegments = Math.ceil(span / 3);
  const curvatureBoost = Math.ceil(180 / directrixGap);
  return clamp(baseSegments + curvatureBoost, 96, 320);
}

function drawArcStroke(ctx, arc, sweepX, W, H, strokeStyle, lineWidth, alpha = 1) {
  const y0 = Math.max(0, arc.yTop);
  const y1 = Math.min(H, arc.yBot);
  if (y1 <= y0) return;

  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const N = getParabolaSampleCount(arc, sweepX);
  const dy = (y1 - y0) / N;
  let started = false;
  for (let i = 0; i <= N; i++) {
    const y = y0 + i * dy;
    const x = parabolaX(arc.site, sweepX, y);
    if (!isFinite(x) || x < -140 || x > W + 140) continue;
    const cx = Math.max(-18, Math.min(W + 18, x));
    if (!started) {
      ctx.moveTo(cx, y);
      started = true;
    } else {
      ctx.lineTo(cx, y);
    }
  }
  if (started) ctx.stroke();
  ctx.restore();
}

function drawBeachlineHighlight(ctx, debug, activeNodeId, sweepX, theme, W, H) {
  if (!debug?.tree || !activeNodeId) return;
  const node = debug.tree.nodesById[activeNodeId];
  if (!node) return;

  const highlightArcs = debug.arcs.slice(node.spanStart, node.spanEnd + 1);
  for (const arc of highlightArcs) {
    const arcColor = col(arc.site.id);
    drawArcStroke(ctx, arc, sweepX, W, H, arcColor, node.kind === "leaf" ? 5.8 : 4.8, node.kind === "leaf" ? 1 : 0.95);
  }

  if (node.kind === "leaf") {
    const siteColor = col(node.siteId);
    ctx.save();
    ctx.strokeStyle = siteColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(node.siteX, node.siteY, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = siteColor;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(node.siteX, node.siteY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const boundaryBreakpoints = node.boundaryBreakpointIndices
    .map(index => debug.breakpoints[index])
    .filter(point => point && isFinite(point.x) && isFinite(point.y));
  const splitPoint = debug.breakpoints[node.breakpointIndex];

  ctx.save();
  const boundaryColor = col(debug.arcs[node.spanStart].site.id);
  ctx.fillStyle = boundaryColor;
  ctx.strokeStyle = theme.bg;
  ctx.lineWidth = 2;
  for (const point of boundaryBreakpoints) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  if (splitPoint && isFinite(splitPoint.x) && isFinite(splitPoint.y)) {
    const splitColor = col(splitPoint.lowerSiteId);
    ctx.fillStyle = splitColor;
    ctx.strokeStyle = theme.siteDot;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(splitPoint.x, splitPoint.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = splitColor;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(splitPoint.x, splitPoint.y, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawQueuedSiteHighlight(ctx, focus, H) {
  const siteColor = col(focus.siteId);
  ctx.save();
  ctx.strokeStyle = siteColor;
  ctx.fillStyle = siteColor;
  ctx.lineWidth = 2.4;
  ctx.setLineDash([7, 6]);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(focus.siteX, 0);
  ctx.lineTo(focus.siteX, H);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(focus.siteX, focus.siteY, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(focus.siteX, focus.siteY, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawQueuedCircleHighlight(ctx, focus, theme, H) {
  ctx.save();
  ctx.strokeStyle = `rgba(${theme.circleRgb},0.95)`;
  ctx.fillStyle = `rgba(${theme.circleDotRgb},0.95)`;
  ctx.lineWidth = 2.2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(focus.centerX, focus.centerY, focus.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(focus.centerX, focus.centerY, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([4, 5]);
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(focus.x, 0);
  ctx.lineTo(focus.x, H);
  ctx.stroke();
  ctx.restore();
}

function drawVertexHighlight(ctx, focus, theme) {
  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.fillStyle = theme.accent;
  ctx.lineWidth = 2.4;
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.arc(focus.x, focus.y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(focus.x, focus.y, 6.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawEdgeHighlight(ctx, focus, theme) {
  ctx.save();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 4.4;
  ctx.globalAlpha = 0.95;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(focus.x1, focus.y1);
  ctx.lineTo(focus.x2, focus.y2);
  ctx.stroke();

  ctx.fillStyle = theme.accent;
  for (const point of [
    { x: focus.x1, y: focus.y1 },
    { x: focus.x2, y: focus.y2 },
  ]) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFaceHighlight(ctx, focus, theme) {
  if (!focus.polygon?.length) return;
  ctx.save();
  const fillColor = focus.siteId != null ? col(focus.siteId) : theme.accent;
  ctx.fillStyle = `${fillColor}22`;
  ctx.strokeStyle = fillColor;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(focus.polygon[0].x, focus.polygon[0].y);
  for (let i = 1; i < focus.polygon.length; i++) {
    ctx.lineTo(focus.polygon[i].x, focus.polygon[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (focus.siteX != null && focus.siteY != null) {
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(focus.siteX, focus.siteY, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSidebarFocus(ctx, focus, beachlineDebug, sweepX, theme, W, H) {
  if (!focus) return;

  if (focus.kind === "beach-node") {
    drawBeachlineHighlight(ctx, beachlineDebug, focus.id, sweepX, theme, W, H);
    return;
  }
  if (focus.kind === "queue-site") {
    drawQueuedSiteHighlight(ctx, focus, H);
    return;
  }
  if (focus.kind === "queue-circle") {
    drawQueuedCircleHighlight(ctx, focus, theme, H);
    return;
  }
  if (focus.kind === "dcel-vertex") {
    drawVertexHighlight(ctx, focus, theme);
    return;
  }
  if (focus.kind === "dcel-face") {
    drawFaceHighlight(ctx, focus, theme);
    return;
  }
  if (focus.kind === "dcel-half-edge") {
    drawEdgeHighlight(ctx, focus, theme);
  }
}

function drawSidebarFocuses(ctx, pinnedSidebarFocuses, hoveredSidebarFocus, beachlineDebug, sweepX, theme, W, H) {
  const pinned = dedupeSidebarFocuses(pinnedSidebarFocuses);
  for (const focus of pinned) {
    drawSidebarFocus(ctx, focus, beachlineDebug, sweepX, theme, W, H);
  }
  if (hoveredSidebarFocus && !hasSidebarFocus(pinned, hoveredSidebarFocus)) {
    drawSidebarFocus(ctx, hoveredSidebarFocus, beachlineDebug, sweepX, theme, W, H);
  }
}

// ─── Canvas draw ────────────────────────────────────────────────────────────
function draw(ctx, W, H, sites, algo, displaySweepX, opts, preview, mode, theme, pinnedSidebarFocuses = [], hoveredSidebarFocus = null) {
  const renderScale = ctx.canvas.width / W;
  ctx.save();
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.clearRect(0,0,W,H);

  ctx.fillStyle = theme.bg; ctx.fillRect(0,0,W,H);

  // Grid dots
  ctx.fillStyle = theme.gridDot;
  for (let x=20;x<W;x+=40) for (let y=20;y<H;y+=40) {
    ctx.beginPath(); ctx.arc(x,y,0.8,0,Math.PI*2); ctx.fill();
  }

  // Preview edges in place mode
  if (mode==="place" && preview?.length) {
    ctx.strokeStyle = theme.previewEdge;
    ctx.lineWidth = 1; ctx.setLineDash([5,4]);
    for (const e of preview) {
      const cl = clipLine(e.x1,e.y1,e.x2,e.y2,0,0,W,H);
      if (cl) { ctx.beginPath(); ctx.moveTo(cl[0],cl[1]); ctx.lineTo(cl[2],cl[3]); ctx.stroke(); }
    }
    ctx.setLineDash([]);
  }

  const sx = displaySweepX;
  const beachlineDebug = algo && (mode === "animate" || mode === "done")
    ? algo.getBeachlineDebug(sx)
    : null;

  if (algo && (mode === "animate" || mode === "done")) {
    // ── Completed edges ──
    if (opts.edges) {
      const edges = algo.getEdges();
      ctx.lineCap = "round"; ctx.strokeStyle = theme.edgeStroke; ctx.lineWidth = 1.6;
      for (const e of edges) {
        const cl = clipLine(e.x1,e.y1,e.x2,e.y2,-2,-2,W+2,H+2);
        if (cl) { ctx.beginPath(); ctx.moveTo(cl[0],cl[1]); ctx.lineTo(cl[2],cl[3]); ctx.stroke(); }
      }

      // ── Growing edges (only during animation) ──
      if (mode === "animate") {
        const growing = algo.getGrowingEdges(sx);
        ctx.strokeStyle = theme.growingEdge; ctx.lineWidth = 1.2;
        ctx.setLineDash([4,3]);
        for (const e of growing) {
          const cl = clipLine(e.x1,e.y1,e.x2,e.y2,-2,-2,W+2,H+2);
          if (cl) { ctx.beginPath(); ctx.moveTo(cl[0],cl[1]); ctx.lineTo(cl[2],cl[3]); ctx.stroke(); }
        }
        ctx.setLineDash([]);
      }
    }

    // ── Circle events (only during animation) ──
    if (opts.circles && mode === "animate") {
      const pending = algo.getPending();
      for (const c of pending) {
        if (c.x - sx > 200) continue;
        const prox = 1 - Math.max(0, Math.min(1, (c.x - sx) / 200));
        ctx.strokeStyle = `rgba(${theme.circleRgb},${0.1+prox*0.25})`; ctx.lineWidth = 1;
        ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.arc(c.center.x,c.center.y,c.radius,0,Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(${theme.circleDotRgb},${0.2+prox*0.3})`;
        ctx.beginPath(); ctx.arc(c.center.x,c.center.y,2.5,0,Math.PI*2); ctx.fill();
      }
      const recent = algo.activeCircles.filter(c => sx - c.sweepX < 80);
      for (const c of recent) {
        const age = sx - c.sweepX;
        const alpha = Math.max(0, 0.7 - age/80*0.7);
        ctx.strokeStyle = `rgba(${theme.circleRgb},${alpha})`; ctx.lineWidth = 1.0;
        ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.arc(c.center.x,c.center.y,c.radius,0,Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(${theme.circleDotRgb},${alpha})`;
        ctx.beginPath(); ctx.arc(c.center.x,c.center.y,3.5,0,Math.PI*2); ctx.fill();
      }
    }

    // ── Beachline (only during animation) ──
    if (opts.beach && mode === "animate") {
      const arcs = beachlineDebug?.arcs ?? algo.getArcsAt(sx);
      for (const arc of arcs) {
        drawArcStroke(ctx, arc, sx, W, H, col(arc.site.id), 2.5, 0.8);
      }
    }

    if (pinnedSidebarFocuses.length || hoveredSidebarFocus) {
      drawSidebarFocuses(ctx, pinnedSidebarFocuses, hoveredSidebarFocus, beachlineDebug, sx, theme, W, H);
    }

    // ── Sweep line (during animation and done mode for scrubbing) ──
    if (opts.sweep && (mode === "animate" || mode === "done")) {
      const g = ctx.createLinearGradient(sx-50,0,sx+4,0);
      g.addColorStop(0,theme.sweepGlow+"0)");
      g.addColorStop(0.85,theme.sweepGlow+"0.04)");
      g.addColorStop(1,theme.sweepGlow+"0)");
      ctx.fillStyle = g; ctx.fillRect(sx-50,0,54,H);

      ctx.strokeStyle = theme.sweepLine; ctx.lineWidth = 2;
      ctx.setLineDash([8,5]);
      ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,H); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = theme.sweepText;
      ctx.font = "11px 'JetBrains Mono',monospace"; ctx.textAlign = "right";
      ctx.fillText(`x = ${sx.toFixed(0)}`, sx-8, 16);
    }

    // ── Vertices (only inside bounds) ──
    for (const v of algo.vertices) {
      if (v.x < -10 || v.x > W+10 || v.y < -10 || v.y > H+10) continue;
      ctx.fillStyle = theme.vertexFill;
      ctx.beginPath(); ctx.arc(v.x,v.y,2.5,0,Math.PI*2); ctx.fill();
    }
  }

  // ── Sites ──
  for (let i=0;i<sites.length;i++){
    const s = sites[i], c = col(i);
    const processed = algo ? sx >= s.x : false;
    const active = processed || mode==="place" || mode==="done";
    const justPassed = mode==="animate" && sx >= s.x && sx - s.x < 30;

    if (justPassed) {
      const fade = 1 - (sx - s.x) / 30;
      ctx.globalAlpha = 0.2 * fade; ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(s.x,s.y,18,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    const r = mode==="place"?6:active?5:3.5;
    ctx.fillStyle = active?c:theme.siteInactive;
    ctx.beginPath(); ctx.arc(s.x,s.y,r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = active?theme.siteDot:theme.siteDotInactive;
    ctx.beginPath(); ctx.arc(s.x,s.y,r*0.4,0,Math.PI*2); ctx.fill();
  }

  // Empty state
  if (!sites.length) {
    ctx.fillStyle = theme.emptyText; ctx.font = "16px 'DM Sans',sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Click anywhere to place Voronoi sites", W/2, H/2-8);
    ctx.fillStyle = theme.emptySubtext; ctx.font = "13px 'DM Sans',sans-serif";
    ctx.fillText("Right-click to remove · Then press Play", W/2, H/2+16);
  }

  ctx.restore();
}

function BeachlineTreeView({
  debug,
  theme,
  activeNodeId,
  pinnedNodeIds,
  onHoverNode,
  onLeaveTree,
  onToggleNode,
}) {
  const emptyViewportStyle = {
    position:"relative",
    border:`1px solid ${theme.panelBorder}`,
    borderRadius:14,
    background:`radial-gradient(circle at top, ${theme.btnBg} 0%, ${theme.panelBg} 72%)`,
    padding:12,
    boxShadow:`inset 0 1px 0 ${theme.panelBorder}55`,
  };

  if (!debug?.tree) {
    return (
      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-start",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button disabled style={{
              background:theme.btnBg,border:`1px solid ${theme.btnBorder}`,borderRadius:999,padding:"5px 9px",
              cursor:"default",color:theme.textDimmer,opacity:0.5,fontSize:10,fontFamily:"'JetBrains Mono',monospace"
            }}>
              Root
            </button>
            <button disabled style={{
              background:theme.btnBg,border:`1px solid ${theme.btnBorder}`,borderRadius:999,padding:"5px 9px",
              cursor:"default",color:theme.textDimmer,opacity:0.5,fontSize:10,fontFamily:"'JetBrains Mono',monospace"
            }}>
              Center Selection
            </button>
          </div>
        </div>
        <div style={emptyViewportStyle}>
          <div style={{
            height:"min(430px, 54vh)",
            minHeight:280,
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
            color:theme.textDim,
            textAlign:"center",
            lineHeight:1.6,
            padding:"0 24px",
          }}>
            No live tree yet.
          </div>
          <div style={{
            pointerEvents:"none",
            position:"absolute",
            inset:12,
            borderRadius:12,
            boxShadow:`inset 0 18px 24px -24px ${theme.pageBg}, inset 0 -18px 24px -24px ${theme.pageBg}`,
          }}/>
        </div>
        <div style={{ color: theme.textMuted, marginTop: 10, marginBottom: 4 }}>Order:</div>
        <div style={{
          color: theme.textDim,
          lineHeight: 1.6,
          background: theme.btnBg,
          border:`1px solid ${theme.panelBorder}`,
          borderRadius:12,
          padding:"8px 10px",
        }}>
          —
        </div>
      </div>
    );
  }

  const layout = useMemo(() => layoutBeachlineTree(debug.tree), [debug.tree]);
  const viewportRef = useRef(null);
  const panStateRef = useRef(null);
  const wheelMomentumRef = useRef({ dx: 0, dy: 0, raf: 0 });
  const [isPanning, setIsPanning] = useState(false);
  if (!layout) return null;

  const centerNode = useCallback((nodeId, behavior = "smooth") => {
    const viewport = viewportRef.current;
    const node = layout.nodesById[nodeId];
    if (!viewport || !node) return;
    const nextLeft = Math.max(0, Math.min(node.x - viewport.clientWidth / 2, viewport.scrollWidth - viewport.clientWidth));
    const nextTop = Math.max(0, Math.min(node.y - viewport.clientHeight / 2, viewport.scrollHeight - viewport.clientHeight));
    viewport.scrollTo({ left: nextLeft, top: nextTop, behavior });
  }, [layout]);

  const lastPinnedNodeId = pinnedNodeIds?.length ? pinnedNodeIds[pinnedNodeIds.length - 1] : null;
  const focusTargetId = activeNodeId || lastPinnedNodeId || debug.tree.rootId;

  const flushWheelMomentum = useCallback(() => {
    const viewport = viewportRef.current;
    const wheel = wheelMomentumRef.current;
    if (!viewport) {
      wheel.raf = 0;
      return;
    }

    const stepX = Math.abs(wheel.dx) < 0.35 ? wheel.dx : wheel.dx * 0.34;
    const stepY = Math.abs(wheel.dy) < 0.35 ? wheel.dy : wheel.dy * 0.34;
    viewport.scrollLeft += stepX;
    viewport.scrollTop += stepY;
    wheel.dx -= stepX;
    wheel.dy -= stepY;

    if (Math.abs(wheel.dx) < 0.2 && Math.abs(wheel.dy) < 0.2) {
      wheel.dx = 0;
      wheel.dy = 0;
      wheel.raf = 0;
      return;
    }

    wheel.raf = requestAnimationFrame(flushWheelMomentum);
  }, []);

  const queueWheelPan = useCallback((deltaX, deltaY) => {
    const wheel = wheelMomentumRef.current;
    wheel.dx += deltaX;
    wheel.dy += deltaY;
    if (!wheel.raf) wheel.raf = requestAnimationFrame(flushWheelMomentum);
  }, [flushWheelMomentum]);

  useEffect(() => {
    if (lastPinnedNodeId) centerNode(lastPinnedNodeId, "smooth");
  }, [lastPinnedNodeId, centerNode]);

  useEffect(() => {
    setIsPanning(false);
    panStateRef.current = null;
    if (wheelMomentumRef.current.raf) cancelAnimationFrame(wheelMomentumRef.current.raf);
    wheelMomentumRef.current = { dx: 0, dy: 0, raf: 0 };
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTo({ left: 0, top: 0, behavior: "auto" });
  }, [debug.tree.rootId]);

  useEffect(() => () => {
    if (wheelMomentumRef.current.raf) cancelAnimationFrame(wheelMomentumRef.current.raf);
  }, []);

  useEffect(() => {
    if (!isPanning) return;
    const handleMove = event => {
      const viewport = viewportRef.current;
      const state = panStateRef.current;
      if (!viewport || !state) return;
      viewport.scrollLeft = state.scrollLeft - (event.clientX - state.startX);
      viewport.scrollTop = state.scrollTop - (event.clientY - state.startY);
    };
    const handleUp = () => {
      setIsPanning(false);
      panStateRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isPanning]);

  const beginPan = useCallback(event => {
    if (event.button !== 0) return;
    const target = event.target;
    const isSvgSurface = target instanceof SVGSVGElement || target instanceof SVGRectElement;
    if (!isSvgSurface) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    panStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsPanning(true);
  }, []);

  const handleWheel = useCallback(event => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const canPanX = viewport.scrollWidth > viewport.clientWidth + 1;
    const canPanY = viewport.scrollHeight > viewport.clientHeight + 1;
    if (!canPanX && !canPanY) return;

    let deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode);
    let deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);

    if (event.shiftKey && Math.abs(deltaX) < Math.abs(deltaY) * 0.75) {
      deltaX += deltaY;
      deltaY = 0;
    } else if (!canPanY && canPanX && Math.abs(deltaY) > Math.abs(deltaX)) {
      deltaX += deltaY * 0.9;
      deltaY = 0;
    }

    const wantsX = Math.abs(deltaX) > 0.1;
    const wantsY = Math.abs(deltaY) > 0.1;
    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth - 1;
    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight - 1;
    const canConsumeX = wantsX && canPanX && (
      (deltaX < 0 && viewport.scrollLeft > 0) ||
      (deltaX > 0 && viewport.scrollLeft < maxScrollLeft)
    );
    const canConsumeY = wantsY && canPanY && (
      (deltaY < 0 && viewport.scrollTop > 0) ||
      (deltaY > 0 && viewport.scrollTop < maxScrollTop)
    );
    const shouldCapture = canConsumeX || canConsumeY || (canPanX && !canPanY && wantsX);
    if (!shouldCapture) return;

    event.preventDefault();
    queueWheelPan(deltaX, deltaY);
  }, [queueWheelPan]);

  return (
    <div onMouseLeave={onLeaveTree}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-start",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={() => centerNode(debug.tree.rootId)} style={{
            background:theme.btnBg,border:`1px solid ${theme.btnBorder}`,borderRadius:999,padding:"5px 9px",
            cursor:"pointer",color:theme.textMuted,fontSize:10,fontFamily:"'JetBrains Mono',monospace"
          }}>
            Root
          </button>
          <button onClick={() => focusTargetId && centerNode(focusTargetId)} style={{
            background:theme.btnBg,border:`1px solid ${theme.btnBorder}`,borderRadius:999,padding:"5px 9px",
            cursor:"pointer",color:theme.textMuted,fontSize:10,fontFamily:"'JetBrains Mono',monospace"
          }}>
            Center Selection
          </button>
        </div>
      </div>
      <div style={{
        position:"relative",
        border:`1px solid ${theme.panelBorder}`,
        borderRadius:14,
        background:`radial-gradient(circle at top, ${theme.btnBg} 0%, ${theme.panelBg} 72%)`,
        padding:12,
        boxShadow:`inset 0 1px 0 ${theme.panelBorder}55`,
      }}>
        <div
          ref={viewportRef}
          onWheel={handleWheel}
          style={{
            overflow:"auto",
            height:"min(430px, 54vh)",
            minHeight:280,
            padding:"6px 8px 8px 6px",
            scrollBehavior:"auto",
            overscrollBehavior:"contain",
            scrollbarWidth:"thin",
            scrollbarColor:`${theme.btnBorder} transparent`,
            scrollbarGutter:"stable both-edges",
            WebkitOverflowScrolling:"touch",
            touchAction:"none",
            cursor:isPanning ? "grabbing" : (layout.width > 260 || layout.height > 220 ? "grab" : "default"),
          }}
        >
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ display: "block" }}
          onMouseDown={beginPan}
        >
          <rect x="0" y="0" width={layout.width} height={layout.height} rx="16" fill="transparent" />
          {layout.nodes
            .filter(node => node.kind === "internal")
            .map(node => {
              const left = layout.nodesById[node.leftId];
              const right = layout.nodesById[node.rightId];
              if (!left || !right) return null;
              return (
                <g key={`${node.id}-links`} stroke={theme.panelBorder} strokeWidth="1.5" fill="none" opacity="0.9">
                  <line x1={node.x} y1={node.y + node.boxHeight / 2} x2={left.x} y2={left.y - left.boxHeight / 2 + 1} />
                  <line x1={node.x} y1={node.y + node.boxHeight / 2} x2={right.x} y2={right.y - right.boxHeight / 2 + 1} />
                </g>
              );
            })}

          {layout.nodes.map(node => {
            const isActive = node.id === activeNodeId;
            const isPinned = pinnedNodeIds?.includes(node.id) ?? false;
            const isLeaf = node.kind === "leaf";
            const fill = isLeaf ? col(node.siteId) : theme.btnBg;
            const stroke = isActive || isPinned ? theme.accent : isLeaf ? fill : theme.btnBorder;
            const textColor = isLeaf ? theme.siteDot : theme.text;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x - node.boxWidth / 2} ${node.y - node.boxHeight / 2})`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => onHoverNode(node.id)}
                onMouseLeave={() => onHoverNode(null)}
                onClick={() => onToggleNode(node.id)}
              >
                <rect
                  width={node.boxWidth}
                  height={node.boxHeight}
                  rx={isLeaf ? 13 : 10}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isPinned ? 2.5 : isActive ? 2 : 1.2}
                  opacity={isActive || isPinned ? 1 : isLeaf ? 0.92 : 1}
                />
                <text
                  x={node.boxWidth / 2}
                  y={node.boxHeight / 2 + 4}
                  textAnchor="middle"
                  fill={textColor}
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: isLeaf ? 11 : 10,
                    fontWeight: isLeaf ? 600 : 500,
                    userSelect: "none",
                  }}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
        <div style={{
          pointerEvents:"none",
          position:"absolute",
          inset:12,
          borderRadius:12,
          boxShadow:`inset 0 18px 24px -24px ${theme.pageBg}, inset 0 -18px 24px -24px ${theme.pageBg}`,
        }}/>
      </div>
      <div style={{ color: theme.textMuted, marginTop: 10, marginBottom: 4 }}>Order:</div>
      <div style={{
        color: theme.textDim,
        lineHeight: 1.6,
        background: theme.btnBg,
        border:`1px solid ${theme.panelBorder}`,
        borderRadius:12,
        padding:"8px 10px",
        overflowX:"auto",
      }}>
        {debug.orderSummary}
      </div>
    </div>
  );
}

function PanelSection({ title, summary, expanded, onToggle, theme, children }) {
  return (
    <div style={{borderTop:`1px solid ${theme.panelBorder}`,paddingTop:6}}>
      <button onClick={onToggle} style={{
        background:"none",border:"none",cursor:"pointer",width:"100%",display:"flex",
        justifyContent:"space-between",alignItems:"center",padding:"2px 0",color:theme.textMuted,
        fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600}}>
        <span>{expanded?"▾":"▸"} {title}</span>
        <span style={{color:theme.textDim,fontWeight:400,fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>{summary}</span>
      </button>
      {expanded&&<div style={{marginTop:4}}>{children}</div>}
    </div>
  );
}

function sidebarFocusStillExists(focus, panelData) {
  if (!focus) return false;
  if (focus.kind === "beach-node") {
    return Boolean(panelData.beach?.tree?.nodesById[focus.id]);
  }
  if (focus.kind === "queue-site" || focus.kind === "queue-circle") {
    return panelData.queue?.some(item => item.id === focus.id) ?? false;
  }
  if (focus.kind === "dcel-vertex") {
    return panelData.dcel?.vertices.some(vertex => vertex.id === focus.vertexId) ?? false;
  }
  if (focus.kind === "dcel-face") {
    return panelData.dcel?.faces.some(face => face.id === focus.faceId) ?? false;
  }
  if (focus.kind === "dcel-half-edge") {
    return panelData.dcel?.halfEdges.some(edge => edge.id === focus.halfEdgeId) ?? false;
  }
  return false;
}

function SidebarCard({
  active = false,
  pinned = false,
  accent,
  theme,
  children,
  onMouseEnter,
  onMouseLeave,
  onClick,
}) {
  return (
    <button
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: active || pinned ? `${accent}14` : theme.btnBg,
        border: `1px solid ${active || pinned ? accent : theme.panelBorder}`,
        borderRadius: 12,
        padding: "10px 11px",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {children}
    </button>
  );
}

function StructuresSidebar({
  docked,
  sidebarWidth,
  theme,
  panelData,
  panelExpanded,
  setPanelExpanded,
  canStepToPreviousEvent,
  onStepToPreviousEvent,
  canStepToNextEvent,
  onStepToNextEvent,
  onJumpToQueueEvent,
  hoveredSidebarFocus,
  pinnedSidebarFocuses,
  onPinAllFocuses,
  onClearPinnedFocuses,
  activeBeachNodeId,
  pinnedBeachNodeIds,
  onHoverFocus,
  onTogglePinnedFocus,
  onClose,
}) {
  return (
    <aside style={{
      width: sidebarWidth,
      maxHeight: docked ? "calc(100vh - 32px)" : "calc(100vh - 20px)",
      background: theme.panelBg,
      border: `1px solid ${theme.panelBorder}`,
      borderRadius: 22,
      boxShadow: theme.shadow,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      position: docked ? "sticky" : "relative",
      top: docked ? 16 : undefined,
    }}>
      <div style={{
        padding:"18px 18px 16px",
        borderBottom:`1px solid ${theme.panelBorder}`,
        background:`linear-gradient(180deg, ${theme.btnBg} 0%, ${theme.panelBg} 100%)`,
      }}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
          <div>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:16,color:theme.heading}}>
              Structures
            </div>
          </div>
          <button onClick={onClose} style={{
            background:theme.btnBg,border:`1px solid ${theme.btnBorder}`,borderRadius:10,padding:"6px 10px",
            cursor:"pointer",color:theme.textMuted,fontSize:11,fontFamily:"'JetBrains Mono',monospace"
          }}>
            Close
          </button>
        </div>
      </div>

      <div style={{
        padding:"14px 16px 18px",
        overflowY:"auto",
        display:"flex",
        flexDirection:"column",
        gap:12,
        scrollBehavior:"smooth",
        overscrollBehavior:"contain",
        scrollbarWidth:"thin",
        scrollbarColor:`${theme.btnBorder} transparent`,
        scrollPaddingTop:12,
      }}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <div style={{
            background:theme.btnBg,border:`1px solid ${theme.panelBorder}`,borderRadius:999,padding:"6px 10px",
            color:theme.textMuted,fontSize:10,fontFamily:"'JetBrains Mono',monospace"
          }}>
            {panelData.queue ? `${panelData.queue.length} queued` : "Queue idle"}
          </div>
          <div style={{
            background:theme.btnBg,border:`1px solid ${theme.panelBorder}`,borderRadius:999,padding:"6px 10px",
            color:theme.textMuted,fontSize:10,fontFamily:"'JetBrains Mono',monospace"
          }}>
            {panelData.beach?.tree ? `${panelData.beach.arcs.length} arcs live` : "No live tree yet"}
          </div>
          <button onClick={onPinAllFocuses} style={{
            background:theme.btnBg,border:`1px solid ${theme.btnBorder}`,borderRadius:999,padding:"6px 10px",
            cursor:"pointer",color:theme.textMuted,fontSize:10,fontFamily:"'JetBrains Mono',monospace"
          }}>
            All
          </button>
          <button onClick={onClearPinnedFocuses} style={{
            background:theme.btnBg,border:`1px solid ${theme.btnBorder}`,borderRadius:999,padding:"6px 10px",
            cursor:"pointer",color:pinnedSidebarFocuses.length ? theme.textMuted : theme.textDimmer,
            opacity:pinnedSidebarFocuses.length ? 1 : 0.5,fontSize:10,fontFamily:"'JetBrains Mono',monospace"
          }}>
            None
          </button>
          <div style={{
            background:theme.btnBg,border:`1px solid ${theme.panelBorder}`,borderRadius:999,padding:"6px 10px",
            color:theme.textMuted,fontSize:10,fontFamily:"'JetBrains Mono',monospace"
          }}>
            {pinnedSidebarFocuses.length} locked
          </div>
        </div>

        <PanelSection title="Beachline Tree" theme={theme}
          summary={panelData.beach?.tree?`${panelData.beach.arcs.length} arcs · ${panelData.beach.breakpoints.length} breaks`:"—"}
          expanded={panelExpanded.beach} onToggle={()=>setPanelExpanded(p=>({...p,beach:!p.beach}))}>
          <BeachlineTreeView
            debug={panelData.beach}
            theme={theme}
            activeNodeId={activeBeachNodeId}
            pinnedNodeIds={pinnedBeachNodeIds}
            onHoverNode={nodeId => onHoverFocus(nodeId ? makeSidebarFocus("beach-node", nodeId) : null)}
            onLeaveTree={() => onHoverFocus(null)}
            onToggleNode={nodeId => onTogglePinnedFocus(makeSidebarFocus("beach-node", nodeId))}
          />
        </PanelSection>

        <PanelSection title="Priority Queue" theme={theme}
          summary={panelData.queue?`${panelData.queue.length} events`:"—"}
          expanded={panelExpanded.queue} onToggle={()=>setPanelExpanded(p=>({...p,queue:!p.queue}))}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",justifyContent:"flex-start",gap:8,flexWrap:"wrap"}}>
              <button
                onClick={onStepToPreviousEvent}
                disabled={!canStepToPreviousEvent}
                style={{
                  background: theme.btnBg,
                  border: `1px solid ${theme.btnBorder}`,
                  borderRadius: 999,
                  padding: "6px 10px",
                  cursor: canStepToPreviousEvent ? "pointer" : "default",
                  color: canStepToPreviousEvent ? theme.textMuted : theme.textDimmer,
                  opacity: canStepToPreviousEvent ? 1 : 0.45,
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                ← Previous Event
              </button>
              <button
                onClick={onStepToNextEvent}
                disabled={!canStepToNextEvent}
                style={{
                  background: theme.btnBg,
                  border: `1px solid ${theme.btnBorder}`,
                  borderRadius: 999,
                  padding: "6px 10px",
                  cursor: canStepToNextEvent ? "pointer" : "default",
                  color: canStepToNextEvent ? theme.textMuted : theme.textDimmer,
                  opacity: canStepToNextEvent ? 1 : 0.45,
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                Next Event →
              </button>
            </div>
            {panelData.queue?.length ? (
              <>
                {panelData.queue.slice(0, 16).map(ev => {
                  const focus = ev.type === "site"
                    ? makeSidebarFocus("queue-site", ev.id, ev)
                    : makeSidebarFocus("queue-circle", ev.id, ev);
                  const active = sameSidebarFocus(hoveredSidebarFocus, focus);
                  const accent = ev.type === "site" ? col(ev.siteId) : theme.accent;
                  return (
                    <SidebarCard
                      key={ev.id}
                      active={active}
                      pinned={false}
                      accent={accent}
                      theme={theme}
                      onMouseEnter={() => onHoverFocus(focus)}
                      onMouseLeave={() => onHoverFocus(null)}
                      onClick={() => onJumpToQueueEvent(ev)}
                    >
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>
                          <span style={{
                            color: ev.type === "site" ? col(ev.siteId) : theme.accent,
                            fontWeight: 600,
                          }}>
                            {ev.type === "site" ? `● s${ev.siteId}` : "○ circle"}
                          </span>
                          <span style={{color:theme.textDim}}>x={ev.x}</span>
                        </div>
                        <span style={{color:active ? accent : theme.textDimmer,fontSize:10,fontFamily:"'JetBrains Mono',monospace"}}>
                          {active ? "preview" : "jump"}
                        </span>
                      </div>
                      <div style={{color:theme.textMuted,fontSize:11,lineHeight:1.55,marginTop:6}}>
                        {ev.type === "site"
                          ? `Site at (${ev.siteX}, ${ev.siteY})`
                          : `Center (${ev.centerX}, ${ev.centerY}) · r=${ev.radius}${ev.tripleSiteIds?.filter(id => id != null).length ? ` · sites ${ev.tripleSiteIds.filter(id => id != null).map(id => `s${id}`).join(" / ")}` : ""}`}
                      </div>
                    </SidebarCard>
                  );
                })}
                {panelData.queue.length > 16 && (
                  <div style={{color:theme.textDimmer,fontSize:11}}>
                    ...+{panelData.queue.length - 16} more events queued
                  </div>
                )}
              </>
            ) : (
              <div style={{color:theme.textDim,lineHeight:1.6}}>
                No pending events right now.
              </div>
            )}
          </div>
        </PanelSection>

        <PanelSection title="DCEL" theme={theme}
          summary={panelData.dcel?`${panelData.dcel.vertexCount}V · ${panelData.dcel.halfEdgeCount}HE · ${panelData.dcel.faceCount}F`:"—"}
          expanded={panelExpanded.dcel} onToggle={()=>setPanelExpanded(p=>({...p,dcel:!p.dcel}))}>
          {panelData.dcel ? (
            <div style={{display:"grid",gap:10}}>
              <div>
                <div style={{color:theme.textMuted,marginBottom:6,fontSize:11,textTransform:"uppercase",letterSpacing:"0.04em"}}>
                  Vertices
                </div>
                <div style={{display:"grid",gap:7}}>
                  {panelData.dcel.vertices.length ? panelData.dcel.vertices.slice(0, 12).map(vertex => {
                    const focus = makeSidebarFocus("dcel-vertex", `vertex-${vertex.id}`, { ...vertex, vertexId: vertex.id });
                    const active = sameSidebarFocus(hoveredSidebarFocus, focus);
                    const pinned = hasSidebarFocus(pinnedSidebarFocuses, focus);
                    return (
                      <SidebarCard
                        key={vertex.id}
                        active={active}
                        pinned={pinned}
                        accent={theme.accent}
                        theme={theme}
                        onMouseEnter={() => onHoverFocus(focus)}
                        onMouseLeave={() => onHoverFocus(null)}
                        onClick={() => onTogglePinnedFocus(focus)}
                      >
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                          <span style={{color:theme.text,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>v{vertex.id}</span>
                          <span style={{color:theme.textDim,fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>
                            ({vertex.x}, {vertex.y})
                          </span>
                        </div>
                        <div style={{color:theme.textMuted,fontSize:11,lineHeight:1.55,marginTop:6}}>
                          origin edge: {vertex.incidentEdge != null ? `e${vertex.incidentEdge}` : "—"}
                        </div>
                      </SidebarCard>
                    );
                  }) : (
                    <div style={{color:theme.textDim,lineHeight:1.6}}>No vertices have formed yet.</div>
                  )}
                  {panelData.dcel.vertices.length > 12 && (
                    <div style={{color:theme.textDimmer,fontSize:11}}>
                      ...+{panelData.dcel.vertices.length - 12} more vertices
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div style={{color:theme.textMuted,marginBottom:6,fontSize:11,textTransform:"uppercase",letterSpacing:"0.04em"}}>
                  Faces
                </div>
                <div style={{display:"grid",gap:7}}>
                  {panelData.dcel.faces.length ? panelData.dcel.faces.slice(0, 12).map(face => {
                    const focus = makeSidebarFocus("dcel-face", `face-${face.id}`, { ...face, faceId: face.id });
                    const active = sameSidebarFocus(hoveredSidebarFocus, focus);
                    const pinned = hasSidebarFocus(pinnedSidebarFocuses, focus);
                    const accent = face.siteId != null ? col(face.siteId) : theme.accent;
                    return (
                      <SidebarCard
                        key={face.id}
                        active={active}
                        pinned={pinned}
                        accent={accent}
                        theme={theme}
                        onMouseEnter={() => onHoverFocus(focus)}
                        onMouseLeave={() => onHoverFocus(null)}
                        onClick={() => onTogglePinnedFocus(focus)}
                      >
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                          <span style={{color:theme.text,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>
                            {face.isOuter ? "f_out" : `f${face.siteId}`}
                          </span>
                          <span style={{color:theme.textDim,fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>
                            {face.isOuter ? "outside" : `site s${face.siteId}`}
                          </span>
                        </div>
                        <div style={{color:theme.textMuted,fontSize:11,lineHeight:1.55,marginTop:6}}>
                          outer: {face.outerComponent != null ? `e${face.outerComponent}` : "—"}
                          {" · "}
                          inner: {face.innerComponents.length ? face.innerComponents.map(id => `e${id}`).join(", ") : "none"}
                        </div>
                      </SidebarCard>
                    );
                  }) : (
                    <div style={{color:theme.textDim,lineHeight:1.6}}>No faces available yet.</div>
                  )}
                  {panelData.dcel.faces.length > 12 && (
                    <div style={{color:theme.textDimmer,fontSize:11}}>
                      ...+{panelData.dcel.faces.length - 12} more faces
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div style={{color:theme.textMuted,marginBottom:6,fontSize:11,textTransform:"uppercase",letterSpacing:"0.04em"}}>
                  Half-Edges
                </div>
                <div style={{display:"grid",gap:7}}>
                  {panelData.dcel.halfEdges.length ? panelData.dcel.halfEdges.slice(0, 14).map(edge => {
                    const focus = makeSidebarFocus("dcel-half-edge", `half-edge-${edge.id}`, { ...edge, halfEdgeId: edge.id });
                    const active = sameSidebarFocus(hoveredSidebarFocus, focus);
                    const pinned = hasSidebarFocus(pinnedSidebarFocuses, focus);
                    const accent = edge.leftSiteId != null ? col(edge.leftSiteId) : theme.accent;
                    return (
                      <SidebarCard
                        key={edge.id}
                        active={active}
                        pinned={pinned}
                        accent={accent}
                        theme={theme}
                        onMouseEnter={() => onHoverFocus(focus)}
                        onMouseLeave={() => onHoverFocus(null)}
                        onClick={() => onTogglePinnedFocus(focus)}
                      >
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                          <span style={{color:theme.text,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>e{edge.id}</span>
                          <span style={{color:theme.textDim,fontFamily:"'JetBrains Mono',monospace",fontSize:10}}>
                            v{edge.origin} → v{edge.destination}
                          </span>
                        </div>
                        <div style={{color:theme.textMuted,fontSize:11,lineHeight:1.55,marginTop:6}}>
                          twin: {edge.twin != null ? `e${edge.twin}` : "—"}
                          {" · "}
                          face: {edge.incidentFace === "f_out" ? "f_out" : edge.incidentFace}
                        </div>
                        <div style={{color:theme.textMuted,fontSize:11,lineHeight:1.55}}>
                          next: {edge.next != null ? `e${edge.next}` : "—"}
                          {" · "}
                          prev: {edge.prev != null ? `e${edge.prev}` : "—"}
                        </div>
                      </SidebarCard>
                    );
                  }) : (
                    <div style={{color:theme.textDim,lineHeight:1.6}}>No half-edges available yet.</div>
                  )}
                  {panelData.dcel.halfEdges.length > 14 && (
                    <div style={{color:theme.textDimmer,fontSize:11}}>
                      ...+{panelData.dcel.halfEdges.length - 14} more half-edges
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </PanelSection>
      </div>
    </aside>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function VoronoiVisualizer() {
  const FINE_SCRUB_STEP = 0.25;
  const COARSE_SCRUB_STEP = 2;
  const [sites, setSites] = useState([]);
  const [mode, setMode] = useState("place");
  const [playing, setPlaying] = useState(false);
  const [hud, setHud] = useState(() => makeHudState(null, 0));
  const [speed, setSpeed] = useState(30);
  const [showSweep, setShowSweep] = useState(true);
  const [showBeach, setShowBeach] = useState(true);
  const [showCircles, setShowCircles] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [panelExpanded, setPanelExpanded] = useState({ dcel:false, queue:false, beach:true });
  const [panelData, setPanelData] = useState({ dcel:null, queue:null, beach:null });
  const [hoveredSidebarFocus, setHoveredSidebarFocus] = useState(null);
  const [pinnedSidebarFocuses, setPinnedSidebarFocuses] = useState([]);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === "undefined" ? 1440 : window.innerWidth);
  const theme = darkMode ? THEMES.dark : THEMES.light;

  const cvs = useRef(null);
  const alg = useRef(null);
  const anim = useRef(null);
  const sweepXRef = useRef(0);
  const prevTimestamp = useRef(0);
  const prev = useRef([]);
  const dragging = useRef(null); // { index, startX, startY, moved }
  const sweepDragging = useRef(false); // true when dragging the sweep line
  const [canvasCursor, setCanvasCursor] = useState("crosshair");
  const activeBeachNodeId = hoveredSidebarFocus?.kind === "beach-node" ? hoveredSidebarFocus.id : null;
  const pinnedBeachNodeIds = pinnedSidebarFocuses
    .filter(focus => focus.kind === "beach-node")
    .map(focus => focus.id);
  const isDockedSidebar = showPanel && viewportWidth >= 1320;
  const isDrawerSidebar = showPanel && !isDockedSidebar;
  const dockedSidebarWidth = clamp(Math.round(viewportWidth * 0.3), 430, 500);
  const drawerSidebarWidth = Math.min(480, Math.max(340, viewportWidth - 20));

  const W=860, H=520;

  useEffect(() => { document.body.style.background = theme.pageBg; }, [theme]);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const syncHud = useCallback((algo, sweepX) => {
    const next = makeHudState(algo, sweepX);
    setHud(prevHud => sameHudState(prevHud, next) ? prevHud : next);
  }, []);

  // Rebuild algorithm state at an arbitrary x position (enables backward scrubbing)
  const rebuildTo = useCallback((targetX) => {
    const algo = new FortuneAlgo(sites, W, H);
    if (targetX > 0) algo.advanceTo(targetX);
    alg.current = algo;
    sweepXRef.current = targetX;
    syncHud(algo, targetX);
    const c = cvs.current; if (!c) return;
    draw(c.getContext("2d"), W, H, sites, algo, targetX,
      {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges}, prev.current, "animate", theme, pinnedSidebarFocuses, hoveredSidebarFocus);
  }, [sites, showSweep, showBeach, showCircles, showEdges, syncHud, theme, pinnedSidebarFocuses, hoveredSidebarFocus]);

  // Scrub to any x position — goes forward if possible, rebuilds if backward
  const scrubTo = useCallback((targetX) => {
    const clamped = Math.max(-10, Math.min(W + 100, targetX));
    const algo = alg.current;
    if (algo && !algo.done && clamped >= sweepXRef.current) {
      // Forward: just advance the existing algo
      sweepXRef.current = clamped;
      algo.advanceTo(clamped);
      syncHud(algo, clamped);
      const c = cvs.current; if (!c) return;
      draw(c.getContext("2d"), W, H, sites, algo, clamped,
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges}, prev.current, "animate", theme, pinnedSidebarFocuses, hoveredSidebarFocus);
    } else {
      // Backward (or algo was done): must replay from scratch
      rebuildTo(clamped);
    }
  }, [sites, showSweep, showBeach, showCircles, showEdges, syncHud, theme, rebuildTo, pinnedSidebarFocuses, hoveredSidebarFocus]);

  // Update panel data when HUD changes (event boundaries) and panel is visible
  useEffect(() => {
    if (!showPanel) return;
    const algo = alg.current; if (!algo) { setPanelData({ dcel:null, queue:null, beach:null }); return; }
    setPanelData({
      dcel: algo.getDCEL(),
      queue: algo.getQueueContents(),
      beach: algo.getBeachlineDebug(sweepXRef.current),
    });
  }, [hud, showPanel]);

  useEffect(() => {
    if (hoveredSidebarFocus && !sidebarFocusStillExists(hoveredSidebarFocus, panelData)) {
      setHoveredSidebarFocus(null);
    }
    setPinnedSidebarFocuses(current => {
      const filtered = current.filter(focus =>
        focus.kind !== "queue-site" &&
        focus.kind !== "queue-circle" &&
        sidebarFocusStillExists(focus, panelData)
      );
      return filtered.length === current.length ? current : filtered;
    });
  }, [panelData, hoveredSidebarFocus]);

  useEffect(() => {
    if (!showPanel) {
      setHoveredSidebarFocus(null);
      setPinnedSidebarFocuses([]);
    }
  }, [showPanel]);

  const handleHoverSidebarFocus = useCallback(focus => {
    setHoveredSidebarFocus(focus);
  }, []);

  const handleTogglePinnedSidebarFocus = useCallback(focus => {
    setPinnedSidebarFocuses(current => hasSidebarFocus(current, focus)
      ? current.filter(item => !sameSidebarFocus(item, focus))
      : [...current, focus]
    );
  }, []);

  const handleClearPinnedSidebarFocuses = useCallback(() => {
    setPinnedSidebarFocuses([]);
  }, []);

  const handlePinAllSidebarFocuses = useCallback(() => {
    setPinnedSidebarFocuses(buildAllSidebarFocuses(panelData));
  }, []);

  const handleJumpToQueueEvent = useCallback(event => {
    if (mode !== "animate") return;
    const algo = alg.current;
    if (!algo || algo.done) return;
    setPlaying(false);
    scrubTo(event.rawX + 0.1);
  }, [mode, scrubTo]);

  function pxPerSec(s) {
    if (s <= 50) return 10 + (s/50)*140;
    return 150 + ((s-50)/50)*650;
  }

  useEffect(() => {
    if (mode==="place"&&sites.length>=2) prev.current=computeStatic(sites,W,H);
    else prev.current=[];
  }, [sites, mode]);

  // Static redraws
  useEffect(() => {
    if (mode==="place"||mode==="done") {
      const c=cvs.current; if(!c)return;
      draw(c.getContext("2d"),W,H,sites,alg.current,sweepXRef.current,
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,mode,theme,pinnedSidebarFocuses,hoveredSidebarFocus);
    }
  }, [sites,mode,showSweep,showBeach,showCircles,showEdges,theme,pinnedSidebarFocuses,hoveredSidebarFocus]);

  // Continuous animation
  useEffect(() => {
    if (!playing||mode!=="animate") return;
    let running = true;
    const loop = ts => {
      if (!running) return;
      const algo = alg.current; if (!algo) return;
      if (prevTimestamp.current===0) prevTimestamp.current = ts;
      const dt = Math.min((ts-prevTimestamp.current)/1000, 0.05);
      prevTimestamp.current = ts;
      const newX = sweepXRef.current + pxPerSec(speed)*dt;
      sweepXRef.current = newX;
      algo.advanceTo(newX);
      if (newX > W + 80 && !algo.done) {
        completeAlgorithm(algo, W);
        sweepXRef.current = Math.max(newX, W + 200);
      }
      syncHud(algo, sweepXRef.current);
      if (algo.done) {
        setMode("done"); setPlaying(false);
        const c=cvs.current;
        if(c) draw(c.getContext("2d"),W,H,sites,algo,sweepXRef.current,
          {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,"done",theme,pinnedSidebarFocuses,hoveredSidebarFocus);
        return;
      }
      const c=cvs.current;
      if(c) draw(c.getContext("2d"),W,H,sites,algo,newX,
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,mode,theme,pinnedSidebarFocuses,hoveredSidebarFocus);
      anim.current = requestAnimationFrame(loop);
    };
    anim.current = requestAnimationFrame(loop);
    return()=>{running=false;cancelAnimationFrame(anim.current);};
  },[playing,mode,speed,sites,showSweep,showBeach,showCircles,showEdges,theme,pinnedSidebarFocuses,hoveredSidebarFocus]);

  // Paused redraw
  useEffect(() => {
    if (mode==="animate"&&!playing) {
      const c=cvs.current; if(!c)return;
      draw(c.getContext("2d"),W,H,sites,alg.current,sweepXRef.current,
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,mode,theme,pinnedSidebarFocuses,hoveredSidebarFocus);
    }
  },[mode,playing,showSweep,showBeach,showCircles,showEdges,theme,pinnedSidebarFocuses,hoveredSidebarFocus]);

  const onClick=useCallback(e=>{
    // Suppress click after sweep line drag
    if(sweepDragging.current)return;
    const r=cvs.current.getBoundingClientRect();
    const x=(e.clientX-r.left)*(W/r.width), y=(e.clientY-r.top)*(H/r.height);
    if(mode==="animate"){
      // Click site to jump sweep
      const algo=alg.current; if(!algo||algo.done)return;
      let closest=null, closestDist=25;
      for(let i=0;i<sites.length;i++){
        const d=Math.hypot(sites[i].x-x,sites[i].y-y);
        if(d<closestDist&&sites[i].x>sweepXRef.current){closestDist=d;closest=sites[i];}
      }
      if(!closest)return;
      setPlaying(false);
      sweepXRef.current=closest.x+0.1;
      algo.advanceTo(sweepXRef.current);
      syncHud(algo, sweepXRef.current);
      const c=cvs.current; if(!c)return;
      draw(c.getContext("2d"),W,H,sites,algo,sweepXRef.current,
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,
        algo.done?"done":"animate",theme,pinnedSidebarFocuses,hoveredSidebarFocus);
      if(algo.done){setMode("done");setPlaying(false);}
      return;
    }
    if(mode!=="place")return;
    // Skip if this was a drag
    if(dragging.current?.moved)return;
    // Skip if click is near an existing site (will be handled by drag)
    for(let i=0;i<sites.length;i++){
      if(Math.hypot(sites[i].x-x,sites[i].y-y)<15)return;
    }
    if(x<5||x>W-5||y<5||y>H-5)return;
    setSites(p => appendSites(p, [{ x, y }]));
  },[mode,sites,playing,showSweep,showBeach,showCircles,showEdges,syncHud,theme,pinnedSidebarFocuses,hoveredSidebarFocus]);

  const onCtx=useCallback(e=>{
    e.preventDefault(); if(mode!=="place")return;
    const r=cvs.current.getBoundingClientRect();
    const x=(e.clientX-r.left)*(W/r.width), y=(e.clientY-r.top)*(H/r.height);
    setSites(p=>{if(!p.length)return p;
      let bi=0,bd=1e9; p.forEach((s,i)=>{const d=Math.hypot(s.x-x,s.y-y);if(d<bd){bd=d;bi=i;}});
      return bd<35?p.filter((_,i)=>i!==bi):p;});
  },[mode]);

  const onMouseDown=useCallback(e=>{
    if(e.button!==0)return;
    const r=cvs.current.getBoundingClientRect();
    const x=(e.clientX-r.left)*(W/r.width), y=(e.clientY-r.top)*(H/r.height);
    // Sweep line drag: click within 12px of sweep line in animate/done mode
    if((mode==="animate"||mode==="done")&&Math.abs(x-sweepXRef.current)<12){
      sweepDragging.current=true;
      setPlaying(false);
      if(mode==="done")setMode("animate");
      return;
    }
    if(mode!=="place")return;
    for(let i=0;i<sites.length;i++){
      if(Math.hypot(sites[i].x-x,sites[i].y-y)<15){
        dragging.current={index:i,startX:x,startY:y,moved:false};
        return;
      }
    }
    dragging.current=null;
  },[mode,sites]);

  const onMouseMove=useCallback(e=>{
    const r=cvs.current.getBoundingClientRect();
    const x=(e.clientX-r.left)*(W/r.width);
    // Sweep line dragging
    if(sweepDragging.current&&(mode==="animate"||mode==="done")){
      scrubTo(x);
      return;
    }
    // Update cursor based on proximity to sweep line
    if(mode==="animate"||mode==="done"){
      setCanvasCursor(Math.abs(x-sweepXRef.current)<12?"ew-resize":"default");
    }
    if(!dragging.current||mode!=="place")return;
    const cx=Math.max(5,Math.min(W-5,x));
    const y=Math.max(5,Math.min(H-5,(e.clientY-r.top)*(H/r.height)));
    const d=dragging.current;
    if(!d.moved&&Math.hypot(cx-d.startX,y-d.startY)<3)return;
    d.moved=true;
    setSites(p=>{const n=[...p];n[d.index]={x:cx,y};return n;});
  },[mode,scrubTo]);

  const onMouseUp=useCallback(()=>{
    if(sweepDragging.current){sweepDragging.current=false;return;}
    // Defer clearing so onClick (which fires after mouseup) can still read .moved
    if(dragging.current) setTimeout(()=>{dragging.current=null;},0);
  },[]);

  const startPlay=useCallback(()=>{
    if(sites.length<2)return;
    alg.current=new FortuneAlgo(sites,W,H);
    sweepXRef.current=-10; prevTimestamp.current=0;
    syncHud(alg.current, sweepXRef.current);
    setMode("animate"); setPlaying(true);
  },[sites,syncHud]);

  const stepToNext=useCallback(()=>{
    const algo=alg.current; if(!algo||algo.done)return;
    const nx=algo.nextEventX();
    if(nx==null){
      completeAlgorithm(algo, W);
      sweepXRef.current = W + 200;
      setMode("done");setPlaying(false);
    } else {
      sweepXRef.current=nx+0.1;algo.advanceTo(sweepXRef.current);
    }
    syncHud(algo, sweepXRef.current);
    const c=cvs.current; if(!c)return;
    draw(c.getContext("2d"),W,H,sites,algo,sweepXRef.current,
      {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,
      algo.done?"done":"animate",theme,pinnedSidebarFocuses,hoveredSidebarFocus);
    if(algo.done){setMode("done");setPlaying(false);}
  },[sites,showSweep,showBeach,showCircles,showEdges,syncHud,theme,pinnedSidebarFocuses,hoveredSidebarFocus]);

  const stepToPrevious = useCallback(() => {
    const algo = alg.current;
    if (!algo) return;
    const history = algo.getEventHistory();
    let target = null;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].rawX <= sweepXRef.current - 0.11) {
        target = history[i].rawX + 0.1;
        break;
      }
    }
    setPlaying(false);
    if (mode === "done") setMode("animate");
    if (target == null) {
      rebuildTo(-10);
      return;
    }
    rebuildTo(target);
  }, [mode, rebuildTo]);

  const stepPx=useCallback((delta)=>{
    if(!alg.current)return;
    if(mode==="done"&&delta<0)setMode("animate");
    scrubTo(sweepXRef.current+delta);
  },[scrubTo,mode]);

  // Keyboard shortcuts
  useEffect(()=>{
    const handler=(e)=>{
      if(e.target.tagName==="INPUT")return;
      if(e.key==="ArrowRight"&&(mode==="animate"||mode==="done")&&!playing){e.preventDefault();stepPx(e.shiftKey?COARSE_SCRUB_STEP:FINE_SCRUB_STEP);}
      else if(e.key==="ArrowLeft"&&(mode==="animate"||mode==="done")&&!playing){e.preventDefault();stepPx(e.shiftKey?-COARSE_SCRUB_STEP:-FINE_SCRUB_STEP);}
      else if(e.key===" "){
        e.preventDefault();
        if(mode==="animate")setPlaying(p=>{prevTimestamp.current=0;return!p;});
        else if(mode==="place"&&sites.length>=2)startPlay();
      }
      else if(e.key==="n"&&mode==="animate"&&!playing)stepToNext();
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[mode,playing,stepPx,stepToNext,startPlay,sites.length,FINE_SCRUB_STEP,COARSE_SCRUB_STEP]);

  const reset=useCallback(()=>{
    setPlaying(false);cancelAnimationFrame(anim.current);
    alg.current=null;sweepXRef.current=0;prevTimestamp.current=0;
    setHoveredSidebarFocus(null);
    setPinnedSidebarFocuses([]);
    syncHud(null, 0);
    setMode("place");
  },[syncHud]);

  const clear=useCallback(()=>{setSites([]);reset();},[reset]);

  const addR=useCallback(n=>{
    const m=45;
    const candidates = Array.from({length:n},()=>({x:m+Math.random()*(W-2*m),y:m+Math.random()*(H-2*m)}));
    setSites(p => appendSites(p, candidates));
  },[]);

  const dpr=typeof window!=="undefined"?(window.devicePixelRatio||1):1;
  const eventHistory = alg.current ? alg.current.getEventHistory() : [];
  const canStepToPreviousEvent = (mode === "animate" || mode === "done") &&
    !playing &&
    eventHistory.some(event => event.rawX <= sweepXRef.current - 0.11);
  const canStepToNextEvent = Boolean(panelData.queue?.length) && !playing && mode === "animate";

  const pS={display:"flex",gap:4,background:theme.pillBg,borderRadius:10,padding:4,border:`1px solid ${theme.pillBorder}`,alignItems:"center"};
  const bS=(acc,dng)=>({
    background:acc?theme.btnAccBg:theme.btnBg,color:acc?theme.btnAccText:dng?"#f87171":theme.btnText,
    border:"1px solid "+(acc?theme.btnAccBorder:theme.btnBorder),borderRadius:7,padding:"6px 13px",cursor:"pointer",
    fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:acc?700:500,transition:"all 0.15s",
  });
  const sidebarButtonLabel = showPanel ? "Hide Sidebar" : "Open Sidebar";
  const layoutMaxWidth = isDockedSidebar ? Math.max(1360, dockedSidebarWidth + 920) : 980;
  const stageMaxWidth = 860;
  const targetRenderWidth = 3840;
  const renderScale = Math.max(dpr, targetRenderWidth / W);
  const renderBufferWidth = Math.round(W * renderScale);
  const renderBufferHeight = Math.round(H * renderScale);

  return(
    <div style={{minHeight:"100vh",background:theme.pageBg,color:theme.text,fontFamily:"'DM Sans',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 16px",position:"relative"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:layoutMaxWidth,display:"grid",gridTemplateColumns:isDockedSidebar?`minmax(0, 1fr) ${dockedSidebarWidth}px`:"1fr",gap:isDockedSidebar?26:22,alignItems:"start"}}>
        <div style={{minWidth:0,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{textAlign:"center",marginBottom:14,maxWidth:stageMaxWidth,width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
            <div>
            <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.5px",color:theme.heading,margin:"0 0 2px"}}>
              <span style={{color:theme.accent}}>◆</span> Voronoi Diagram
              <span style={{color:theme.textDimmer,fontWeight:400,fontSize:16,marginLeft:8}}>Fortune's Sweep Line</span>
            </h1>
            <p style={{color:theme.textDim,fontSize:12,margin:0,fontFamily:"'JetBrains Mono',monospace"}}>
              {mode==="place"?"Left-click to add sites · Right-click to remove · Press ▶ Play":
               mode==="animate"?`Sweep at x = ${hud.sweepX} · ${hud.stepCount||0} events processed`:
               "✓ Complete — drag sweep line or press ← to rewind"}
            </p>
            </div>
            <button onClick={()=>setDarkMode(d=>!d)} title={darkMode?"Switch to light mode":"Switch to dark mode"}
              style={{background:"none",border:`1px solid ${theme.btnBorder}`,borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:16,color:theme.textMuted,lineHeight:1}}>
              {darkMode?"☀️":"🌙"}
            </button>
          </div>

          <div style={{width:"100%",maxWidth:stageMaxWidth,position:"relative",borderRadius:18,overflow:"hidden",border:`1px solid ${theme.panelBorder}`,boxShadow:theme.shadow,flexShrink:0}}>
            <canvas ref={cvs} width={renderBufferWidth} height={renderBufferHeight} onClick={onClick} onContextMenu={onCtx}
              onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
              style={{width:"min(860px,calc(100vw - 32px))",height:"auto",cursor:mode==="place"?(dragging.current?"grabbing":"crosshair"):canvasCursor,display:"block"}}/>

            {mode==="animate"&&hud.lastEventType!=null&&(
              <div style={{position:"absolute",top:10,left:10,
                background:hud.lastEventType===SITE?theme.eventSiteBg:theme.eventCircleBg,
                border:`1px solid ${hud.lastEventType===SITE?theme.eventSiteBorder:theme.eventCircleBorder}`,
                borderRadius:8,padding:"6px 12px",fontFamily:"'JetBrains Mono',monospace",fontSize:11,
                color:hud.lastEventType===SITE?theme.eventSiteText:theme.eventCircleText,backdropFilter:"blur(8px)"}}>
                {hud.lastEventType===SITE?"● Site Event":"○ Circle Event"}
                <span style={{color:theme.textDim,marginLeft:8}}>#{hud.stepCount}</span>
              </div>
            )}
          </div>

          <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",alignItems:"center",maxWidth:stageMaxWidth}}>
            <div style={pS}>
              {mode==="place"?(
                <button onClick={startPlay} disabled={sites.length<2} style={{...bS(sites.length>=2),opacity:sites.length<2?0.4:1}}>▶ Play</button>
              ):(
                <>
                  <button onClick={()=>{setPlaying(p=>!p);prevTimestamp.current=0;}} disabled={mode==="done"}
                    style={{...bS(!playing),opacity:mode==="done"?0.4:1}}>
                    {playing?"⏸ Pause":"▶ Resume"}</button>
                  <button onClick={()=>stepPx(-FINE_SCRUB_STEP)} disabled={playing}
                    style={{...bS(false),opacity:playing?0.4:1}}>
                    ← {FINE_SCRUB_STEP}px</button>
                  <button onClick={()=>stepPx(FINE_SCRUB_STEP)} disabled={playing||mode==="done"}
                    style={{...bS(false),opacity:(playing||mode==="done")?0.4:1}}>
                    {FINE_SCRUB_STEP}px →</button>
                  <button onClick={stepToNext} disabled={playing||mode==="done"}
                    style={{...bS(false),opacity:(playing||mode==="done")?0.4:1}}>
                    Next event →</button>
                </>
              )}
              <button onClick={reset} style={bS(false)}>↺ Reset</button>
            </div>

            <div style={{...pS,padding:"6px 14px",gap:8}}>
              <input type="range" min={1} max={100} value={speed} onChange={e=>setSpeed(+e.target.value)}
                style={{width:100,accentColor:theme.accent,cursor:"pointer"}}/>
              <span style={{fontSize:10,color:theme.textDimmer,fontFamily:"'JetBrains Mono',monospace"}}>{Math.round(pxPerSec(speed))}px/s</span>
            </div>

            {mode==="place"&&(
              <div style={pS}>
                <button onClick={()=>addR(5)} style={bS(false)}>+5</button>
                <button onClick={()=>addR(15)} style={bS(false)}>+15</button>
                <button onClick={()=>addR(30)} style={bS(false)}>+30</button>
                <button onClick={clear} style={bS(false,true)}>Clear</button>
              </div>
            )}
          </div>

          <div style={{marginTop:10,display:"flex",gap:14,flexWrap:"wrap",justifyContent:"center",alignItems:"center"}}>
            {[["Sweep Line",showSweep,setShowSweep,theme.toggleSweep],
              ["Beachline",showBeach,setShowBeach,theme.toggleBeach],
              ["Circle Events",showCircles,setShowCircles,theme.toggleCircle],
              ["Edges",showEdges,setShowEdges,theme.toggleEdge]].map(([l,v,s,c])=>(
              <button key={l} onClick={()=>s(x=>!x)} style={{
                background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
                color:v?c:theme.textDimmer,fontSize:12,fontFamily:"'JetBrains Mono',monospace",padding:"3px 6px"}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:v?c:theme.panelBorder,
                  border:`1.5px solid ${v?c:theme.textDimmer}`,transition:"all 0.15s"}}/>
                {l}
              </button>
            ))}
            <span style={{color:theme.panelBorder}}>│</span>
            <button onClick={()=>setShowPanel(p=>!p)} style={{
              background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
              color:showPanel?theme.accent:theme.textDimmer,fontSize:12,fontFamily:"'JetBrains Mono',monospace",padding:"3px 6px"}}>
              <span style={{width:8,height:8,borderRadius:2,background:showPanel?theme.accent:theme.panelBorder,
                border:`1.5px solid ${showPanel?theme.accent:theme.textDimmer}`,transition:"all 0.15s"}}/>
              {sidebarButtonLabel}
            </button>
          </div>

          <div style={{marginTop:16,maxWidth:stageMaxWidth,width:"100%",display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:10,
            fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>
            {[
              ["Algorithm",[["Type","Fortune's sweep"],["Direction","Left → Right"],["Complexity","O(n log n)"],["Beachline","Parabolic arcs"]]],
              ["Current State",[["Sites",`${sites.length}`],["Events processed",`${hud.stepCount??"—"}`],["Events queued",`${hud.queueLength??"—"}`],["Vertices found",`${hud.vertices??"—"}`]]],
              ["Legend",[["┃ blue","Sweep line (continuous)"],["~ colored","Beachline parabolas"],["◯ gray","Circle events → vertices"],["━ white","Voronoi cell edges"]]],
            ].map(([title,rows])=>(
              <div key={title} style={{background:theme.panelBg,borderRadius:10,padding:"12px 16px",border:`1px solid ${theme.panelBorder}`}}>
                <div style={{color:theme.textMuted,fontWeight:500,marginBottom:6,fontFamily:"'DM Sans',sans-serif",fontSize:13}}>{title}</div>
                {rows.map(([k,v])=>(
                  <div key={k} style={{color:theme.textDim,lineHeight:1.8}}>{k}: <span style={{color:theme.text}}>{v}</span></div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {isDockedSidebar&&(
          <StructuresSidebar
            docked
            sidebarWidth={dockedSidebarWidth}
            theme={theme}
            panelData={panelData}
            panelExpanded={panelExpanded}
            setPanelExpanded={setPanelExpanded}
            canStepToPreviousEvent={canStepToPreviousEvent}
            onStepToPreviousEvent={stepToPrevious}
            canStepToNextEvent={canStepToNextEvent}
            onStepToNextEvent={stepToNext}
            onJumpToQueueEvent={handleJumpToQueueEvent}
            hoveredSidebarFocus={hoveredSidebarFocus}
            pinnedSidebarFocuses={pinnedSidebarFocuses}
            onPinAllFocuses={handlePinAllSidebarFocuses}
            onClearPinnedFocuses={handleClearPinnedSidebarFocuses}
            activeBeachNodeId={activeBeachNodeId}
            pinnedBeachNodeIds={pinnedBeachNodeIds}
            onHoverFocus={handleHoverSidebarFocus}
            onTogglePinnedFocus={handleTogglePinnedSidebarFocus}
            onClose={() => setShowPanel(false)}
          />
        )}
      </div>

      {isDrawerSidebar&&(
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",justifyContent:"flex-end"}}>
          <button
            aria-label="Close sidebar backdrop"
            onClick={() => setShowPanel(false)}
            style={{flex:1,border:"none",background:"rgba(2,6,23,0.45)",backdropFilter:"blur(6px)",cursor:"pointer"}}
          />
          <div style={{padding:12}}>
            <StructuresSidebar
              docked={false}
              sidebarWidth={drawerSidebarWidth}
              theme={theme}
              panelData={panelData}
              panelExpanded={panelExpanded}
              setPanelExpanded={setPanelExpanded}
              canStepToPreviousEvent={canStepToPreviousEvent}
              onStepToPreviousEvent={stepToPrevious}
              canStepToNextEvent={canStepToNextEvent}
              onStepToNextEvent={stepToNext}
              onJumpToQueueEvent={handleJumpToQueueEvent}
              hoveredSidebarFocus={hoveredSidebarFocus}
              pinnedSidebarFocuses={pinnedSidebarFocuses}
              onPinAllFocuses={handlePinAllSidebarFocuses}
              onClearPinnedFocuses={handleClearPinnedSidebarFocuses}
              activeBeachNodeId={activeBeachNodeId}
              pinnedBeachNodeIds={pinnedBeachNodeIds}
              onHoverFocus={handleHoverSidebarFocus}
              onTogglePinnedFocus={handleTogglePinnedSidebarFocus}
              onClose={() => setShowPanel(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
