import { useState, useRef, useCallback, useEffect } from "react";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * VORONOI DIAGRAM — Fortune's Algorithm Visualizer
 * 
 * Left-to-right CONTINUOUS sweep. The display sweep position moves smoothly.
 * Algorithm events are processed when the sweep reaches them.
 * ═══════════════════════════════════════════════════════════════════════════
 */

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

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

const SITE=0, CIRCLE=1;

class FortuneAlgo {
  constructor(sites, W, H) {
    this.W = W; this.H = H;
    this.sites = sites.map((s,i) => ({ x:s.x, y:s.y, id:i }));
    this.sweepX = 0; this.done = false; this.stepCount = 0; this.lastEvent = null;
    this.queue = this.sites.map(s => ({ type:SITE, x:s.x, site:s }));
    this.queue.sort((a,b) => a.x - b.x);
    this.root = null; this.edges = []; this.vertices = [];
    this.activeCircles = [];
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
    if (!this.root) { this.root = { site:s, prev:null, next:null, circleEvent:null, e0:null, e1:null }; return; }
    let arc = this.findArc(s.y);
    if (!arc) { arc = this.root; while (arc.next) arc = arc.next; }
    this.invalidate(arc);
    const a = { site:arc.site, prev:arc.prev, next:null, circleEvent:null, e0:arc.e0, e1:null };
    const b = { site:s, prev:a, next:null, circleEvent:null, e0:null, e1:null };
    const c = { site:arc.site, prev:b, next:arc.next, circleEvent:null, e0:null, e1:arc.e1 };
    a.next = b; b.next = c;
    if (arc.prev) arc.prev.next = a;
    if (arc.next) arc.next.prev = c;
    if (this.root === arc) this.root = a;
    const sp = { x: parabolaX(arc.site, this.sweepX, s.y), y: s.y };
    // Edge between top arc (a) and new arc (b): separates a.site (above) from b.site (below)
    const e1 = { start:{...sp}, end:null, left:arc.site, right:s, topSite:arc.site, botSite:s };
    // Edge between new arc (b) and bottom arc (c): separates b.site (above) from c.site=arc.site (below)
    const e2 = { start:{...sp}, end:null, left:s, right:arc.site, topSite:s, botSite:arc.site };
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
    const e = { start:{...v}, end:null, left:prev?.site, right:next?.site,
                topSite:prev?.site, botSite:next?.site };
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
        arcs.push({ site:a.site, yTop:Math.max(-60,top), yBot:Math.min(this.H+60,bot) });
      }
      a = a.next;
    }
    return arcs;
  }

  getEdges() {
    const bound = Math.max(this.W, this.H) * 2;
    return this.edges.filter(e => {
      if (!e.end) return false;
      // Reject edges with start or end way outside the viewport
      if (Math.abs(e.start.x) > bound || Math.abs(e.start.y) > bound) return false;
      if (Math.abs(e.end.x) > bound || Math.abs(e.end.y) > bound) {
        // For projected edges, check if the edge at least passes near the viewport
        // by checking if the line segment intersects the extended viewport
        const cl = this._clipTest(e.start.x, e.start.y, e.end.x, e.end.y, -50, -50, this.W+50, this.H+50);
        return cl;
      }
      return true;
    }).map(e => ({ x1:e.start.x, y1:e.start.y, x2:e.end.x, y2:e.end.y }));
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

  getDCEL() {
    const verts = this.vertices.map((v,i) => ({ id:i, x:Math.round(v.x*10)/10, y:Math.round(v.y*10)/10 }));
    const eds = this.edges.filter(e=>e.end).map((e,i) => ({
      id:i, x1:Math.round(e.start.x*10)/10, y1:Math.round(e.start.y*10)/10,
      x2:Math.round(e.end.x*10)/10, y2:Math.round(e.end.y*10)/10,
      leftId:e.left?.id, rightId:e.right?.id,
    }));
    const faceIds = new Set(); this.sites.forEach(s=>faceIds.add(s.id));
    return { vertexCount:verts.length, edgeCount:eds.length, faceCount:faceIds.size, vertices:verts, edges:eds };
  }

  getQueueContents() {
    return this.queue.filter(e=>e.type===SITE||!e.invalid).map(e=>({
      type:e.type===SITE?"site":"circle", x:Math.round(e.x*10)/10, siteId:e.type===SITE?e.site.id:null,
    }));
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
    sweepX: Math.round(sweepX),
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

// ─── Canvas draw ────────────────────────────────────────────────────────────
function draw(ctx, W, H, sites, algo, displaySweepX, opts, preview, mode, theme) {
  const dpr = window.devicePixelRatio||1;
  ctx.save(); ctx.scale(dpr,dpr);
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
      const arcs = algo.getArcsAt(sx);
      for (const arc of arcs) {
        const f = arc.site;
        const y0 = Math.max(0, arc.yTop), y1 = Math.min(H, arc.yBot);
        if (y1 <= y0) continue;
        ctx.strokeStyle = col(f.id); ctx.lineWidth = 2.5; ctx.globalAlpha = 0.8;
        ctx.beginPath();
        const N = 80, dy = (y1-y0)/N;
        let started = false;
        for (let i=0;i<=N;i++){
          const y = y0+i*dy;
          const x = parabolaX(f, sx, y);
          if (!isFinite(x) || x < -100 || x > W + 100) continue;
          const cx = Math.max(-10,Math.min(W+10,x));
          if (!started) { ctx.moveTo(cx,y); started = true; } else ctx.lineTo(cx,y);
        }
        ctx.stroke(); ctx.globalAlpha = 1;
      }
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

      // Drag handle — small diamond at midpoint of sweep line
      const mid = H/2;
      ctx.fillStyle = theme.sweepLine;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, mid-8); ctx.lineTo(sx+5, mid); ctx.lineTo(sx, mid+8); ctx.lineTo(sx-5, mid);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
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

// ─── Component ──────────────────────────────────────────────────────────────
export default function VoronoiVisualizer() {
  const [sites, setSites] = useState([]);
  const [mode, setMode] = useState("place");
  const [playing, setPlaying] = useState(false);
  const [hud, setHud] = useState(() => makeHudState(null, 0));
  const [speed, setSpeed] = useState(30);
  const [showSweep, setShowSweep] = useState(true);
  const [showBeach, setShowBeach] = useState(true);
  const [showCircles, setShowCircles] = useState(true);
  const [showEdges, setShowEdges] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState({ dcel:false, queue:false, beach:false });
  const [panelData, setPanelData] = useState({ dcel:null, queue:null, beach:null });
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

  const W=860, H=520;

  useEffect(() => { document.body.style.background = theme.pageBg; }, [theme]);

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
      {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges}, prev.current, "animate", theme);
  }, [sites, showSweep, showBeach, showCircles, showEdges, syncHud, theme]);

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
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges}, prev.current, "animate", theme);
    } else {
      // Backward (or algo was done): must replay from scratch
      rebuildTo(clamped);
    }
  }, [sites, showSweep, showBeach, showCircles, showEdges, syncHud, theme, rebuildTo]);

  // Update panel data when HUD changes (event boundaries) and panel is visible
  useEffect(() => {
    if (!showPanel) return;
    const algo = alg.current; if (!algo) { setPanelData({ dcel:null, queue:null, beach:null }); return; }
    setPanelData({
      dcel: algo.getDCEL(),
      queue: algo.getQueueContents(),
      beach: algo.getBeachlineList(),
    });
  }, [hud, showPanel]);

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
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,mode,theme);
    }
  }, [sites,mode,showSweep,showBeach,showCircles,showEdges,theme]);

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
          {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,"done",theme);
        return;
      }
      const c=cvs.current;
      if(c) draw(c.getContext("2d"),W,H,sites,algo,newX,
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,mode,theme);
      anim.current = requestAnimationFrame(loop);
    };
    anim.current = requestAnimationFrame(loop);
    return()=>{running=false;cancelAnimationFrame(anim.current);};
  },[playing,mode,speed,sites,showSweep,showBeach,showCircles,showEdges,theme]);

  // Paused redraw
  useEffect(() => {
    if (mode==="animate"&&!playing) {
      const c=cvs.current; if(!c)return;
      draw(c.getContext("2d"),W,H,sites,alg.current,sweepXRef.current,
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,mode,theme);
    }
  },[mode,playing,showSweep,showBeach,showCircles,showEdges,theme]);

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
        algo.done?"done":"animate",theme);
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
  },[mode,sites,playing,showSweep,showBeach,showCircles,showEdges,syncHud,theme]);

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
      algo.done?"done":"animate",theme);
    if(algo.done){setMode("done");setPlaying(false);}
  },[sites,showSweep,showBeach,showCircles,showEdges,syncHud,theme]);

  const stepPx=useCallback((delta)=>{
    if(!alg.current)return;
    if(mode==="done"&&delta<0)setMode("animate");
    scrubTo(sweepXRef.current+delta);
  },[scrubTo,mode]);

  // Keyboard shortcuts
  useEffect(()=>{
    const handler=(e)=>{
      if(e.target.tagName==="INPUT")return;
      if(e.key==="ArrowRight"&&(mode==="animate"||mode==="done")&&!playing){e.preventDefault();stepPx(e.shiftKey?10:1);}
      else if(e.key==="ArrowLeft"&&(mode==="animate"||mode==="done")&&!playing){e.preventDefault();stepPx(e.shiftKey?-10:-1);}
      else if(e.key===" "){
        e.preventDefault();
        if(mode==="animate")setPlaying(p=>{prevTimestamp.current=0;return!p;});
        else if(mode==="place"&&sites.length>=2)startPlay();
      }
      else if(e.key==="n"&&mode==="animate"&&!playing)stepToNext();
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[mode,playing,stepPx,stepToNext,startPlay,sites.length]);

  const reset=useCallback(()=>{
    setPlaying(false);cancelAnimationFrame(anim.current);
    alg.current=null;sweepXRef.current=0;prevTimestamp.current=0;
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
  const speedLabel=speed<=15?"Slow":speed<=40?"Moderate":speed<=70?"Fast":"Very Fast";

  const pS={display:"flex",gap:4,background:theme.pillBg,borderRadius:10,padding:4,border:`1px solid ${theme.pillBorder}`,alignItems:"center"};
  const bS=(acc,dng)=>({
    background:acc?theme.btnAccBg:theme.btnBg,color:acc?theme.btnAccText:dng?"#f87171":theme.btnText,
    border:"1px solid "+(acc?theme.btnAccBorder:theme.btnBorder),borderRadius:7,padding:"6px 13px",cursor:"pointer",
    fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:acc?700:500,transition:"all 0.15s",
  });

  return(
    <div style={{minHeight:"100vh",background:theme.pageBg,color:theme.text,fontFamily:"'DM Sans',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      <div style={{textAlign:"center",marginBottom:14,maxWidth:860,display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
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

      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <div style={{position:"relative",borderRadius:12,overflow:"hidden",border:`1px solid ${theme.panelBorder}`,boxShadow:theme.shadow,flexShrink:0}}>
          <canvas ref={cvs} width={W*dpr} height={H*dpr} onClick={onClick} onContextMenu={onCtx}
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

        {showPanel&&(
          <div style={{width:280,maxHeight:520,overflowY:"auto",background:theme.panelBg,border:`1px solid ${theme.panelBorder}`,
            borderRadius:12,padding:"10px 12px",fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:theme.text,
            display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:14,color:theme.heading,marginBottom:2}}>
              Data Structures
            </div>

            {/* DCEL Section */}
            <PanelSection title="DCEL" theme={theme}
              summary={panelData.dcel?`${panelData.dcel.vertexCount}V · ${panelData.dcel.edgeCount}E · ${panelData.dcel.faceCount}F`:"—"}
              expanded={panelExpanded.dcel} onToggle={()=>setPanelExpanded(p=>({...p,dcel:!p.dcel}))}>
              {panelData.dcel&&(
                <>
                  {panelData.dcel.vertices.length>0&&(
                    <div style={{marginBottom:4}}>
                      <div style={{color:theme.textMuted,marginBottom:2}}>Vertices:</div>
                      {panelData.dcel.vertices.slice(0,20).map(v=>(
                        <div key={v.id} style={{color:theme.textDim,lineHeight:1.6}}>v{v.id}: ({v.x}, {v.y})</div>
                      ))}
                      {panelData.dcel.vertices.length>20&&<div style={{color:theme.textDimmer}}>...+{panelData.dcel.vertices.length-20} more</div>}
                    </div>
                  )}
                  {panelData.dcel.edges.length>0&&(
                    <div>
                      <div style={{color:theme.textMuted,marginBottom:2}}>Edges:</div>
                      {panelData.dcel.edges.slice(0,15).map(e=>(
                        <div key={e.id} style={{color:theme.textDim,lineHeight:1.6}}>
                          e{e.id}: <span style={{color:col(e.leftId)}}>s{e.leftId}</span>|<span style={{color:col(e.rightId)}}>s{e.rightId}</span>
                        </div>
                      ))}
                      {panelData.dcel.edges.length>15&&<div style={{color:theme.textDimmer}}>...+{panelData.dcel.edges.length-15} more</div>}
                    </div>
                  )}
                </>
              )}
            </PanelSection>

            {/* Priority Queue Section */}
            <PanelSection title="Priority Queue" theme={theme}
              summary={panelData.queue?`${panelData.queue.length} events`:"—"}
              expanded={panelExpanded.queue} onToggle={()=>setPanelExpanded(p=>({...p,queue:!p.queue}))}>
              {panelData.queue&&panelData.queue.length>0&&(
                <div>
                  {panelData.queue.slice(0,20).map((ev,i)=>(
                    <div key={i} style={{color:theme.textDim,lineHeight:1.6}}>
                      {ev.type==="site"?<span style={{color:col(ev.siteId)}}>● site s{ev.siteId}</span>:<span>○ circle</span>}
                      {" "}x={ev.x}
                    </div>
                  ))}
                  {panelData.queue.length>20&&<div style={{color:theme.textDimmer}}>...+{panelData.queue.length-20} more</div>}
                </div>
              )}
            </PanelSection>

            {/* Beachline Section */}
            <PanelSection title="Beachline" theme={theme}
              summary={panelData.beach?`${panelData.beach.length} arcs`:"—"}
              expanded={panelExpanded.beach} onToggle={()=>setPanelExpanded(p=>({...p,beach:!p.beach}))}>
              {panelData.beach&&panelData.beach.length>0&&(
                <div>
                  {panelData.beach.slice(0,30).map((arc,i)=>(
                    <div key={i} style={{color:theme.textDim,lineHeight:1.6}}>
                      <span style={{color:col(arc.siteId),fontWeight:500}}>s{arc.siteId}</span>
                      {" "}({Math.round(arc.siteX)}, {Math.round(arc.siteY)})
                    </div>
                  ))}
                  {panelData.beach.length>30&&<div style={{color:theme.textDimmer}}>...+{panelData.beach.length-30} more</div>}
                </div>
              )}
            </PanelSection>
          </div>
        )}
      </div>

      <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",alignItems:"center",maxWidth:860}}>
        <div style={pS}>
          {mode==="place"?(
            <button onClick={startPlay} disabled={sites.length<2} style={{...bS(sites.length>=2),opacity:sites.length<2?0.4:1}}>▶ Play</button>
          ):(
            <>
              <button onClick={()=>{setPlaying(p=>!p);prevTimestamp.current=0;}} disabled={mode==="done"}
                style={{...bS(!playing),opacity:mode==="done"?0.4:1}}>
                {playing?"⏸ Pause":"▶ Resume"}</button>
              <button onClick={()=>stepPx(-1)} disabled={playing}
                style={{...bS(false),opacity:playing?0.4:1}}>
                ← 1px</button>
              <button onClick={()=>stepPx(1)} disabled={playing||mode==="done"}
                style={{...bS(false),opacity:(playing||mode==="done")?0.4:1}}>
                1px →</button>
              <button onClick={stepToNext} disabled={playing||mode==="done"}
                style={{...bS(false),opacity:(playing||mode==="done")?0.4:1}}>
                Next event →</button>
            </>
          )}
          <button onClick={reset} style={bS(false)}>↺ Reset</button>
        </div>

        <div style={{...pS,padding:"6px 14px",gap:8}}>
          <span style={{fontSize:11,color:theme.textDim,fontFamily:"'JetBrains Mono',monospace",minWidth:32}}>{speedLabel}</span>
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
          Data Panel
        </button>
      </div>

      <div style={{marginTop:16,maxWidth:860,width:"100%",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,
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
  );
}
