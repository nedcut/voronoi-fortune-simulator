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
    // Add tiny jitter to prevent exact coordinate matches, dedup near-identical sites
    this.sites = sites.map((s,i) => ({ x:s.x + (i*0.0137 % 0.1), y:s.y + (i*0.0193 % 0.1), id:i }));
    // Remove sites that are too close together
    const filtered = [];
    for (const s of this.sites) {
      let tooClose = false;
      for (const f of filtered) {
        if (Math.hypot(s.x-f.x, s.y-f.y) < 2) { tooClose = true; break; }
      }
      if (!tooClose) filtered.push(s);
    }
    this.sites = filtered;
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
    while (this.queue.length && this.queue[0].x <= x + 0.01 && processed < 100) {
      const evt = this.queue.shift();
      this.sweepX = evt.x; this.lastEvent = evt; this.stepCount++;
      if (evt.type === SITE) this.handleSite(evt);
      else if (!this.handleCircle(evt)) continue;
      processed++;
    }
    this.sweepX = x;
    if (!this.queue.length && processed === 0 && x > this.W + 50) {
      this.finish(); this.done = true;
    }
  }

  nextEventX() {
    for (const e of this.queue) {
      if (e.type === SITE || !e.invalid) return e.x;
    }
    return this.W + 100;
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

function computeStatic(sites, W, H) {
  if (sites.length < 2) return [];
  const a = new FortuneAlgo(sites, W, H);
  let s = 0; while (!a.done && s < 50000) { a.advanceTo(W+200); s++; }
  a.finish(); return a.getEdges();
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

const COLS = [
  "#ef6461","#60a5fa","#4ade80","#facc15","#c084fc",
  "#f472b6","#34d399","#fb923c","#818cf8","#f87171",
  "#2dd4bf","#a3e635","#e879f9","#fbbf24","#67e8f9",
  "#a78bfa","#fb7185","#86efac","#fcd34d","#93c5fd",
];
function col(i){ return COLS[i%COLS.length]; }

// ─── Canvas draw ────────────────────────────────────────────────────────────
function draw(ctx, W, H, sites, algo, displaySweepX, opts, preview, mode) {
  const dpr = window.devicePixelRatio||1;
  ctx.save(); ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);

  ctx.fillStyle = "#0b1120"; ctx.fillRect(0,0,W,H);

  // Grid dots
  ctx.fillStyle = "rgba(30,41,59,0.7)";
  for (let x=20;x<W;x+=40) for (let y=20;y<H;y+=40) {
    ctx.beginPath(); ctx.arc(x,y,0.8,0,Math.PI*2); ctx.fill();
  }

  // Preview edges in place mode
  if (mode==="place" && preview?.length) {
    ctx.strokeStyle = "rgba(100,116,139,0.2)";
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
      ctx.lineCap = "round"; ctx.strokeStyle = "rgba(226,232,240,0.75)"; ctx.lineWidth = 1.6;
      for (const e of edges) {
        const cl = clipLine(e.x1,e.y1,e.x2,e.y2,-2,-2,W+2,H+2);
        if (cl) { ctx.beginPath(); ctx.moveTo(cl[0],cl[1]); ctx.lineTo(cl[2],cl[3]); ctx.stroke(); }
      }

      // ── Growing edges (only during animation) ──
      if (mode === "animate") {
        const growing = algo.getGrowingEdges(sx);
        ctx.strokeStyle = "rgba(226,232,240,0.4)"; ctx.lineWidth = 1.2;
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
        ctx.strokeStyle = `rgba(251,191,36,${0.1+prox*0.25})`; ctx.lineWidth = 1;
        ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.arc(c.center.x,c.center.y,c.radius,0,Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(251,191,36,${0.2+prox*0.3})`;
        ctx.beginPath(); ctx.arc(c.center.x,c.center.y,2.5,0,Math.PI*2); ctx.fill();
      }
      const recent = algo.activeCircles.filter(c => sx - c.sweepX < 80);
      for (const c of recent) {
        const age = sx - c.sweepX;
        const alpha = Math.max(0, 0.7 - age/80*0.7);
        ctx.strokeStyle = `rgba(245,158,11,${alpha})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(c.center.x,c.center.y,c.radius,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle = `rgba(245,158,11,${alpha})`;
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

    // ── Sweep line (only during animation) ──
    if (opts.sweep && mode === "animate") {
      const g = ctx.createLinearGradient(sx-50,0,sx+4,0);
      g.addColorStop(0,"rgba(56,189,248,0)");
      g.addColorStop(0.85,"rgba(56,189,248,0.04)");
      g.addColorStop(1,"rgba(56,189,248,0)");
      ctx.fillStyle = g; ctx.fillRect(sx-50,0,54,H);

      ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 2;
      ctx.setLineDash([8,5]);
      ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,H); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(56,189,248,0.6)";
      ctx.font = "11px 'JetBrains Mono',monospace"; ctx.textAlign = "right";
      ctx.fillText(`x = ${sx.toFixed(0)}`, sx-8, 16);
    }

    // ── Vertices (only inside bounds) ──
    for (const v of algo.vertices) {
      if (v.x < -10 || v.x > W+10 || v.y < -10 || v.y > H+10) continue;
      ctx.fillStyle = "rgba(226,232,240,0.85)";
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
    ctx.fillStyle = active?c:"#334155";
    ctx.beginPath(); ctx.arc(s.x,s.y,r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = active?"rgba(255,255,255,0.9)":"#475569";
    ctx.beginPath(); ctx.arc(s.x,s.y,r*0.4,0,Math.PI*2); ctx.fill();
  }

  // Empty state
  if (!sites.length) {
    ctx.fillStyle = "#334155"; ctx.font = "16px 'DM Sans',sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Click anywhere to place Voronoi sites", W/2, H/2-8);
    ctx.fillStyle = "#1e293b"; ctx.font = "13px 'DM Sans',sans-serif";
    ctx.fillText("Right-click to remove · Then press Play", W/2, H/2+16);
  }

  ctx.restore();
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function VoronoiVisualizer() {
  const [sites, setSites] = useState([]);
  const [mode, setMode] = useState("place");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [showSweep, setShowSweep] = useState(true);
  const [showBeach, setShowBeach] = useState(true);
  const [showCircles, setShowCircles] = useState(true);
  const [showEdges, setShowEdges] = useState(true);

  const cvs = useRef(null);
  const alg = useRef(null);
  const anim = useRef(null);
  const sweepXRef = useRef(0);
  const prevTimestamp = useRef(0);
  const prev = useRef([]);

  const W=860, H=520;

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
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,mode);
    }
  }, [sites,mode,showSweep,showBeach,showCircles,showEdges]);

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
      if (algo.done||newX>W+80) {
        algo.finish(); algo.done=true;
        setMode("done"); setPlaying(false);
        const c=cvs.current;
        if(c) draw(c.getContext("2d"),W,H,sites,algo,newX,
          {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,"done");
        return;
      }
      const c=cvs.current;
      if(c) draw(c.getContext("2d"),W,H,sites,algo,newX,
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,mode);
      anim.current = requestAnimationFrame(loop);
    };
    anim.current = requestAnimationFrame(loop);
    return()=>{running=false;cancelAnimationFrame(anim.current);};
  },[playing,mode,speed,sites,showSweep,showBeach,showCircles,showEdges]);

  // Paused redraw
  useEffect(() => {
    if (mode==="animate"&&!playing) {
      const c=cvs.current; if(!c)return;
      draw(c.getContext("2d"),W,H,sites,alg.current,sweepXRef.current,
        {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,mode);
    }
  },[mode,playing,showSweep,showBeach,showCircles,showEdges]);

  const onClick=useCallback(e=>{
    if(mode!=="place")return;
    const r=cvs.current.getBoundingClientRect();
    const x=(e.clientX-r.left)*(W/r.width), y=(e.clientY-r.top)*(H/r.height);
    if(x<5||x>W-5||y<5||y>H-5)return;
    // Reject if too close to existing site (prevents degenerate cases from fast clicking)
    setSites(p=>{
      for (const s of p) { if (Math.hypot(s.x-x, s.y-y) < 8) return p; }
      return [...p,{x,y}];
    });
  },[mode]);

  const onCtx=useCallback(e=>{
    e.preventDefault(); if(mode!=="place")return;
    const r=cvs.current.getBoundingClientRect();
    const x=(e.clientX-r.left)*(W/r.width), y=(e.clientY-r.top)*(H/r.height);
    setSites(p=>{if(!p.length)return p;
      let bi=0,bd=1e9; p.forEach((s,i)=>{const d=Math.hypot(s.x-x,s.y-y);if(d<bd){bd=d;bi=i;}});
      return bd<35?p.filter((_,i)=>i!==bi):p;});
  },[mode]);

  const startPlay=useCallback(()=>{
    if(sites.length<2)return;
    alg.current=new FortuneAlgo(sites,W,H);
    sweepXRef.current=-10; prevTimestamp.current=0;
    setMode("animate"); setPlaying(true);
  },[sites]);

  const stepToNext=useCallback(()=>{
    const algo=alg.current; if(!algo||algo.done)return;
    const nx=algo.nextEventX();
    if(nx>W+100){algo.finish();algo.done=true;setMode("done");setPlaying(false);}
    else{sweepXRef.current=nx+0.1;algo.advanceTo(sweepXRef.current);}
    const c=cvs.current; if(!c)return;
    draw(c.getContext("2d"),W,H,sites,algo,sweepXRef.current,
      {sweep:showSweep,beach:showBeach,circles:showCircles,edges:showEdges},prev.current,
      algo.done?"done":"animate");
    if(algo.done){setMode("done");setPlaying(false);}
  },[sites,showSweep,showBeach,showCircles,showEdges]);

  const reset=useCallback(()=>{
    setPlaying(false);cancelAnimationFrame(anim.current);
    alg.current=null;sweepXRef.current=0;prevTimestamp.current=0;
    setMode("place");
  },[]);

  const clear=useCallback(()=>{setSites([]);reset();},[reset]);

  const addR=useCallback(n=>{
    const m=45;
    setSites(p=>[...p,...Array.from({length:n},()=>({x:m+Math.random()*(W-2*m),y:m+Math.random()*(H-2*m)}))]);
  },[]);

  const dpr=typeof window!=="undefined"?(window.devicePixelRatio||1):1;
  const a=alg.current;
  const speedLabel=speed<=15?"Slow":speed<=40?"Moderate":speed<=70?"Fast":"Very Fast";

  const pS={display:"flex",gap:4,background:"#111827",borderRadius:10,padding:4,border:"1px solid #1e293b",alignItems:"center"};
  const bS=(acc,dng)=>({
    background:acc?"#38bdf8":"#0b1120",color:acc?"#0b1120":dng?"#f87171":"#94a3b8",
    border:"1px solid "+(acc?"#38bdf8":"#334155"),borderRadius:7,padding:"6px 13px",cursor:"pointer",
    fontSize:13,fontFamily:"'DM Sans',sans-serif",fontWeight:acc?700:500,transition:"all 0.15s",
  });

  return(
    <div style={{minHeight:"100vh",background:"#080d19",color:"#e2e8f0",fontFamily:"'DM Sans',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>

      <div style={{textAlign:"center",marginBottom:14,maxWidth:860}}>
        <h1 style={{fontSize:26,fontWeight:700,letterSpacing:"-0.5px",color:"#f1f5f9",margin:"0 0 2px"}}>
          <span style={{color:"#38bdf8"}}>◆</span> Voronoi Diagram
          <span style={{color:"#475569",fontWeight:400,fontSize:16,marginLeft:8}}>Fortune's Sweep Line</span>
        </h1>
        <p style={{color:"#64748b",fontSize:12,margin:0,fontFamily:"'JetBrains Mono',monospace"}}>
          {mode==="place"?"Left-click to add sites · Right-click to remove · Press ▶ Play":
           mode==="animate"?`Sweep at x = ${Math.round(sweepXRef.current)} · ${a?.stepCount||0} events processed`:
           "✓ Complete — all Voronoi cells computed"}
        </p>
      </div>

      <div style={{position:"relative",borderRadius:12,overflow:"hidden",border:"1px solid #1e293b",boxShadow:"0 20px 50px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.03)"}}>
        <canvas ref={cvs} width={W*dpr} height={H*dpr} onClick={onClick} onContextMenu={onCtx}
          style={{width:"min(860px,calc(100vw - 32px))",height:"auto",cursor:mode==="place"?"crosshair":"default",display:"block"}}/>

        {mode==="animate"&&a?.lastEvent&&(
          <div style={{position:"absolute",top:10,left:10,
            background:a.lastEvent.type===SITE?"rgba(56,189,248,0.12)":"rgba(245,158,11,0.12)",
            border:`1px solid ${a.lastEvent.type===SITE?"rgba(56,189,248,0.3)":"rgba(245,158,11,0.3)"}`,
            borderRadius:8,padding:"6px 12px",fontFamily:"'JetBrains Mono',monospace",fontSize:11,
            color:a.lastEvent.type===SITE?"#7dd3fc":"#fcd34d",backdropFilter:"blur(8px)"}}>
            {a.lastEvent.type===SITE?"● Site Event":"○ Circle Event"}
            <span style={{color:"#64748b",marginLeft:8}}>#{a.stepCount}</span>
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
              <button onClick={stepToNext} disabled={playing||mode==="done"}
                style={{...bS(false),opacity:(playing||mode==="done")?0.4:1}}>
                Next event →</button>
            </>
          )}
          <button onClick={reset} style={bS(false)}>↺ Reset</button>
        </div>

        <div style={{...pS,padding:"6px 14px",gap:8}}>
          <span style={{fontSize:11,color:"#64748b",fontFamily:"'JetBrains Mono',monospace",minWidth:32}}>{speedLabel}</span>
          <input type="range" min={1} max={100} value={speed} onChange={e=>setSpeed(+e.target.value)}
            style={{width:100,accentColor:"#38bdf8",cursor:"pointer"}}/>
          <span style={{fontSize:10,color:"#475569",fontFamily:"'JetBrains Mono',monospace"}}>{Math.round(pxPerSec(speed))}px/s</span>
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

      <div style={{marginTop:10,display:"flex",gap:14,flexWrap:"wrap",justifyContent:"center"}}>
        {[["Sweep Line",showSweep,setShowSweep,"#38bdf8"],
          ["Beachline",showBeach,setShowBeach,"#c084fc"],
          ["Circle Events",showCircles,setShowCircles,"#fbbf24"],
          ["Edges",showEdges,setShowEdges,"#e2e8f0"]].map(([l,v,s,c])=>(
          <button key={l} onClick={()=>s(x=>!x)} style={{
            background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
            color:v?c:"#475569",fontSize:12,fontFamily:"'JetBrains Mono',monospace",padding:"3px 6px"}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:v?c:"#1e293b",
              border:`1.5px solid ${v?c:"#475569"}`,transition:"all 0.15s"}}/>
            {l}
          </button>
        ))}
      </div>

      <div style={{marginTop:16,maxWidth:860,width:"100%",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,
        fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>
        {[
          ["Algorithm",[["Type","Fortune's sweep"],["Direction","Left → Right"],["Complexity","O(n log n)"],["Beachline","Parabolic arcs"]]],
          ["Current State",[["Sites",`${sites.length}`],["Events processed",`${a?.stepCount||"—"}`],["Events queued",`${a?.queue?.length||"—"}`],["Vertices found",`${a?.vertices?.length||"—"}`]]],
          ["Legend",[["┃ blue","Sweep line (continuous)"],["~ colored","Beachline parabolas"],["◯ gold","Circle events → vertices"],["━ white","Voronoi cell edges"]]],
        ].map(([title,rows])=>(
          <div key={title} style={{background:"#111827",borderRadius:10,padding:"12px 16px",border:"1px solid #1e293b"}}>
            <div style={{color:"#94a3b8",fontWeight:500,marginBottom:6,fontFamily:"'DM Sans',sans-serif",fontSize:13}}>{title}</div>
            {rows.map(([k,v])=>(
              <div key={k} style={{color:"#64748b",lineHeight:1.8}}>{k}: <span style={{color:"#e2e8f0"}}>{v}</span></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
