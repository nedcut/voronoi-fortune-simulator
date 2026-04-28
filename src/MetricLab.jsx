import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, TARGET_RENDER_WIDTH } from "./appConstants.js";
import { lpDistance } from "./geometry.js";

const SITE_COLORS = [
  "#ef6461", "#2563eb", "#16a34a", "#ca8a04", "#9333ea",
  "#db2777", "#0d9488", "#ea580c", "#4f46e5", "#dc2626",
];

const METRICS = [
  { id: "l1", label: "L1", p: 1 },
  { id: "l2", label: "L2", p: 2 },
  { id: "linf", label: "L∞", p: Infinity },
  { id: "custom", label: "Lp", p: null },
];

const MIN_CUSTOM_P = -10;
const MAX_CUSTOM_P = 16;
const ZERO_P_GAP = 0.1;
const COLOR_SAMPLE_SIZE = 1;

function colorForSite(index) {
  return SITE_COLORS[index % SITE_COLORS.length];
}

function hexToRgb(hex) {
  const raw = hex.replace("#", "");
  const value = Number.parseInt(raw, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

const SITE_RGB = SITE_COLORS.map(hexToRgb);
const REGION_ALPHA = Math.round(0.14 * 255);
const BOUNDARY_RGB = { r: 15, g: 23, b: 42 };
const BOUNDARY_ALPHA = Math.round(0.28 * 255);

let scratchCanvas = null;

function getScratchCanvas() {
  if (!scratchCanvas) scratchCanvas = document.createElement("canvas");
  if (scratchCanvas.width !== CANVAS_WIDTH) scratchCanvas.width = CANVAS_WIDTH;
  if (scratchCanvas.height !== CANVAS_HEIGHT) scratchCanvas.height = CANVAS_HEIGHT;
  return scratchCanvas;
}

function metricDistanceValue(x, y, site, p) {
  const dx = Math.abs(x - site.x);
  const dy = Math.abs(y - site.y);
  if (p === 2) return dx * dx + dy * dy;
  if (p === 1) return dx + dy;
  if (p === Infinity) return Math.max(dx, dy);
  if (Math.abs(p) < 1e-6) return Math.max(dx, dy);
  if (p < 0) return (dx ** p + dy ** p) ** (1 / p);
  return dx ** p + dy ** p;
}

function nearestSiteIndexAt(x, y, sites, p) {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < sites.length; i++) {
    const d = metricDistanceValue(x, y, sites[i], p);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

function buildMetricLayer(sites, p) {
  if (!sites.length) return null;
  const imageData = new ImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
  const pixels = imageData.data;
  const owners = new Uint16Array(CANVAS_WIDTH * CANVAS_HEIGHT);

  for (let y = 0; y < CANVAS_HEIGHT; y += COLOR_SAMPLE_SIZE) {
    const sampleY = y + COLOR_SAMPLE_SIZE / 2;
    for (let x = 0; x < CANVAS_WIDTH; x += COLOR_SAMPLE_SIZE) {
      const sampleX = x + COLOR_SAMPLE_SIZE / 2;
      const owner = nearestSiteIndexAt(sampleX, sampleY, sites, p);
      const ownerOffset = y * CANVAS_WIDTH + x;
      owners[ownerOffset] = owner;

      const rgb = SITE_RGB[owner % SITE_RGB.length];
      const offset = ownerOffset * 4;
      pixels[offset] = rgb.r;
      pixels[offset + 1] = rgb.g;
      pixels[offset + 2] = rgb.b;
      pixels[offset + 3] = REGION_ALPHA;
    }
  }

  if (p !== 2) {
    for (let y = 0; y < CANVAS_HEIGHT - 1; y++) {
      for (let x = 0; x < CANVAS_WIDTH - 1; x++) {
        const index = y * CANVAS_WIDTH + x;
        if (owners[index] === owners[index + 1] && owners[index] === owners[index + CANVAS_WIDTH]) continue;
        const offset = index * 4;
        pixels[offset] = BOUNDARY_RGB.r;
        pixels[offset + 1] = BOUNDARY_RGB.g;
        pixels[offset + 2] = BOUNDARY_RGB.b;
        pixels[offset + 3] = BOUNDARY_ALPHA;
      }
    }
  }

  return imageData;
}

function drawImageDataLayer(ctx, imageData) {
  const canvas = getScratchCanvas();
  const scratchCtx = canvas.getContext("2d");
  scratchCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(canvas, 0, 0);
}

function clipPolygonAgainstEuclideanBisector(polygon, site, other) {
  if (!polygon.length) return [];
  const a = other.x - site.x;
  const b = other.y - site.y;
  const c = (other.x * other.x + other.y * other.y - site.x * site.x - site.y * site.y) / 2;
  const inside = point => a * point.x + b * point.y <= c + 1e-7;
  const intersect = (p1, p2) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const denom = a * dx + b * dy;
    if (Math.abs(denom) < 1e-9) return { x: p2.x, y: p2.y };
    const t = Math.max(0, Math.min(1, (c - a * p1.x - b * p1.y) / denom));
    return { x: p1.x + dx * t, y: p1.y + dy * t };
  };

  const clipped = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentInside = inside(current);
    const nextInside = inside(next);
    if (currentInside && nextInside) {
      clipped.push(next);
    } else if (currentInside && !nextInside) {
      clipped.push(intersect(current, next));
    } else if (!currentInside && nextInside) {
      clipped.push(intersect(current, next));
      clipped.push(next);
    }
  }
  return clipped;
}

function drawExactEuclideanEdges(ctx, sites) {
  if (sites.length < 2) return;
  const bounds = [
    { x: 0, y: 0 },
    { x: CANVAS_WIDTH, y: 0 },
    { x: CANVAS_WIDTH, y: CANVAS_HEIGHT },
    { x: 0, y: CANVAS_HEIGHT },
  ];

  ctx.save();
  ctx.strokeStyle = "rgba(15,23,42,0.36)";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const site of sites) {
    let polygon = bounds.map(point => ({ ...point }));
    for (const other of sites) {
      if (other === site) continue;
      polygon = clipPolygonAgainstEuclideanBisector(polygon, site, other);
      if (polygon.length < 3) break;
    }
    if (polygon.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function drawUnitBall(ctx, p, x, y, size) {
  const radius = size / 2;
  const safeP = normalizeCustomP(p);
  ctx.save();
  ctx.translate(x + radius, y + radius);
  ctx.strokeStyle = "rgba(15,23,42,0.35)";
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(-radius, -radius, size, size);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-radius, -radius, size, size);
  ctx.clip();
  ctx.beginPath();
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const denom = safeP === Infinity
      ? Math.max(Math.abs(cos), Math.abs(sin))
      : (Math.abs(cos) ** safeP + Math.abs(sin) ** safeP) ** (1 / safeP);
    const rawRadius = radius * 0.72 / denom;
    const r = Number.isFinite(rawRadius) ? rawRadius : radius * 2;
    const px = cos * r;
    const py = sin * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#475569";
  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(p === Infinity ? "unit ball L∞" : `unit ball L${safeP}`, 0, radius - 10);
  ctx.restore();
}

function normalizeCustomP(value) {
  if (value === Infinity) return value;
  if (Math.abs(value) >= ZERO_P_GAP) return value;
  return value < 0 ? -ZERO_P_GAP : ZERO_P_GAP;
}

function formatP(value) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function drawMetricDiagram(ctx, sites, metricP, metricLayer) {
  const renderScale = ctx.canvas.width / CANVAS_WIDTH;
  ctx.save();
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = "rgba(148,163,184,0.28)";
  for (let x = 20; x < CANVAS_WIDTH; x += 40) {
    for (let y = 20; y < CANVAS_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (sites.length) {
    if (metricLayer) drawImageDataLayer(ctx, metricLayer);

    if (metricP === 2) drawExactEuclideanEdges(ctx, sites);
  }

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    ctx.fillStyle = colorForSite(i);
    ctx.beginPath();
    ctx.arc(site.x, site.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(site.x, site.y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!sites.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Click anywhere to place metric sites", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 8);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "13px 'DM Sans', sans-serif";
    ctx.fillText("Switch metrics to watch the cells reshape", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 16);
  }

  drawUnitBall(ctx, metricP, CANVAS_WIDTH - 118, 18, 96);
  ctx.restore();
}

export default function MetricLab({ sites: controlledSites, setSites: setControlledSites } = {}) {
  const [localSites, setLocalSites] = useState([]);
  const sites = controlledSites ?? localSites;
  const setSites = setControlledSites ?? setLocalSites;
  const [metric, setMetric] = useState("l2");
  const [customP, setCustomP] = useState(3);
  const [customPInput, setCustomPInput] = useState("3");
  const canvasRef = useRef(null);
  const dragging = useRef(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const renderScale = Math.max(dpr, TARGET_RENDER_WIDTH / CANVAS_WIDTH);
  const renderBufferWidth = Math.round(CANVAS_WIDTH * renderScale);
  const renderBufferHeight = Math.round(CANVAS_HEIGHT * renderScale);
  const selectedMetric = METRICS.find(item => item.id === metric) ?? METRICS[1];
  const metricP = selectedMetric.p ?? customP;
  const metricLayer = useMemo(() => buildMetricLayer(sites, metricP), [sites, metricP]);

  const commitCustomP = useCallback(value => {
    const parsed = Number(value);
    const normalized = Number.isFinite(parsed)
      ? normalizeCustomP(Math.min(MAX_CUSTOM_P, Math.max(MIN_CUSTOM_P, parsed)))
      : customP;
    setCustomP(normalized);
    setCustomPInput(formatP(normalized));
  }, [customP]);

  const updateCustomP = useCallback(value => {
    setMetric("custom");
    setCustomPInput(value);
    if (value === "" || value === "-" || value === "." || value === "-.") return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setCustomP(normalizeCustomP(Math.min(MAX_CUSTOM_P, Math.max(MIN_CUSTOM_P, parsed))));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawMetricDiagram(canvas.getContext("2d"), sites, metricP, metricLayer);
  }, [sites, metricP, metricLayer]);

  const canvasPoint = useCallback(event => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (CANVAS_WIDTH / rect.width),
      y: (event.clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
    };
  }, []);

  const addSite = useCallback(event => {
    if (dragging.current?.moved) return;
    const point = canvasPoint(event);
    if (point.x < 5 || point.x > CANVAS_WIDTH - 5 || point.y < 5 || point.y > CANVAS_HEIGHT - 5) return;
    for (const site of sites) {
      if (lpDistance(point, site, 2) < 15) return;
    }
    setSites(current => [...current, point]);
  }, [canvasPoint, sites, setSites]);

  const removeSite = useCallback(event => {
    event.preventDefault();
    const point = canvasPoint(event);
    setSites(current => {
      let best = -1;
      let bestDistance = 35;
      for (let i = 0; i < current.length; i++) {
        const d = lpDistance(point, current[i], 2);
        if (d < bestDistance) {
          best = i;
          bestDistance = d;
        }
      }
      return best === -1 ? current : current.filter((_, index) => index !== best);
    });
  }, [canvasPoint, setSites]);

  const startDragSite = useCallback(event => {
    if (event.button !== 0) return;
    const point = canvasPoint(event);
    for (let i = 0; i < sites.length; i++) {
      if (lpDistance(point, sites[i], 2) < 15) {
        dragging.current = { index: i, startX: point.x, startY: point.y, moved: false };
        return;
      }
    }
    dragging.current = null;
  }, [canvasPoint, sites]);

  const dragSite = useCallback(event => {
    const current = dragging.current;
    if (!current) return;
    const point = canvasPoint(event);
    const x = Math.max(5, Math.min(CANVAS_WIDTH - 5, point.x));
    const y = Math.max(5, Math.min(CANVAS_HEIGHT - 5, point.y));
    if (!current.moved && lpDistance({ x, y }, { x: current.startX, y: current.startY }, 2) < 3) return;
    current.moved = true;
    setSites(sites => {
      if (!sites[current.index]) return sites;
      const next = [...sites];
      next[current.index] = { x, y };
      return next;
    });
  }, [canvasPoint, setSites]);

  const endDragSite = useCallback(() => {
    if (dragging.current) setTimeout(() => { dragging.current = null; }, 0);
  }, []);

  const addRandom = useCallback(() => {
    setSites(current => {
      const next = [...current];
      for (let i = 0; i < 5; i++) {
        next.push({
          x: 50 + Math.random() * (CANVAS_WIDTH - 100),
          y: 50 + Math.random() * (CANVAS_HEIGHT - 100),
        });
      }
      return next;
    });
  }, []);

  const buttonStyle = active => ({
    background: active ? "#0f172a" : "#ffffff",
    color: active ? "#ffffff" : "#334155",
    border: `1px solid ${active ? "#0f172a" : "#cbd5e1"}`,
    borderRadius: 7,
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: active ? 700 : 500,
  });

  return (
    <div style={{minHeight:"100vh",background:"#e2e8f0",color:"#1e293b",fontFamily:"'DM Sans',sans-serif",display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 16px"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      <div style={{width:"100%",maxWidth:980,display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{textAlign:"center",marginBottom:14,maxWidth:CANVAS_WIDTH,width:"100%"}}>
          <h1 style={{fontSize:26,fontWeight:700,color:"#0f172a",margin:"0 0 2px"}}>
            <span style={{color:"#0d9488"}}>◆</span> Metric Lab
            <span style={{color:"#64748b",fontWeight:400,fontSize:16,marginLeft:8}}>Lp Voronoi Cells</span>
          </h1>
          <p style={{color:"#64748b",fontSize:12,margin:0,fontFamily:"'JetBrains Mono',monospace"}}>
            Click to add sites · Right-click to remove · Current metric: {selectedMetric.label === "Lp" ? `L${formatP(customP)}` : selectedMetric.label}
          </p>
        </div>

        <div style={{width:"100%",maxWidth:CANVAS_WIDTH,position:"relative",borderRadius:18,overflow:"hidden",border:"1px solid #cbd5e1",boxShadow:"0 10px 30px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.5)",flexShrink:0}}>
          <canvas
            ref={canvasRef}
            width={renderBufferWidth}
            height={renderBufferHeight}
            onClick={addSite}
            onContextMenu={removeSite}
            onMouseDown={startDragSite}
            onMouseMove={dragSite}
            onMouseUp={endDragSite}
            onMouseLeave={endDragSite}
            style={{width:`min(${CANVAS_WIDTH}px,calc(100vw - 32px))`,height:"auto",cursor:dragging.current ? "grabbing" : "crosshair",display:"block"}}
          />
        </div>

        <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",alignItems:"center"}}>
          <div style={{display:"flex",gap:4,background:"#ffffff",borderRadius:10,padding:4,border:"1px solid #cbd5e1",alignItems:"center"}}>
            {METRICS.map(item => (
              <button key={item.id} onClick={() => setMetric(item.id)} style={buttonStyle(metric === item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:8,background:"#ffffff",borderRadius:10,padding:"6px 14px",border:"1px solid #cbd5e1",alignItems:"center",opacity:metric === "custom" ? 1 : 0.55}}>
            <input
              type="range"
              min={MIN_CUSTOM_P}
              max={MAX_CUSTOM_P}
              step={0.1}
              value={customP}
              onChange={event => {
                updateCustomP(event.target.value);
                setCustomPInput(formatP(Number(event.target.value)));
              }}
              disabled={metric !== "custom"}
              style={{width:120,accentColor:"#0d9488",cursor:metric === "custom" ? "pointer" : "default"}}
            />
            <input
              type="number"
              min={MIN_CUSTOM_P}
              max={MAX_CUSTOM_P}
              step={0.1}
              value={customPInput}
              onChange={event => updateCustomP(event.target.value)}
              onBlur={event => commitCustomP(event.target.value)}
              onFocus={() => setMetric("custom")}
              style={{width:58,border:"1px solid #cbd5e1",borderRadius:6,padding:"4px 6px",fontSize:11,color:"#334155",fontFamily:"'JetBrains Mono',monospace"}}
            />
            <span style={{fontSize:10,color:"#64748b",fontFamily:"'JetBrains Mono',monospace"}}>p</span>
          </div>
          <div style={{display:"flex",gap:4,background:"#ffffff",borderRadius:10,padding:4,border:"1px solid #cbd5e1",alignItems:"center"}}>
            <button onClick={addRandom} style={buttonStyle(false)}>+5</button>
            <button onClick={() => setSites([])} style={{...buttonStyle(false),color:"#dc2626"}}>Clear</button>
          </div>
        </div>

        <div style={{marginTop:16,maxWidth:CANVAS_WIDTH,width:"100%",display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:10,fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>
          {[
            ["Metric", [["Distance", selectedMetric.label === "Lp" ? `(|dx|^p + |dy|^p)^(1/p)` : selectedMetric.label], ["p", metricP === Infinity ? "infinity" : `${metricP}`], ["Kind", metricP < 1 ? "experimental" : "metric"], ["Sites", `${sites.length}`]]],
            ["Reading Cells", [["Color", "nearest site"], ["Edges", metricP === 2 ? "exact Euclidean" : "smooth sampled contours"], ["Inset", "unit ball"]]],
            ["Next Step", [["Compare", "same sites, two metrics"], ["Exact edges", "Euclidean mode"], ["Lessons", "distance and bisectors"]]],
          ].map(([title, rows]) => (
            <div key={title} style={{background:"#ffffff",borderRadius:10,padding:"12px 16px",border:"1px solid #cbd5e1"}}>
              <div style={{color:"#475569",fontWeight:500,marginBottom:6,fontFamily:"'DM Sans',sans-serif",fontSize:13}}>{title}</div>
              {rows.map(([key, value]) => (
                <div key={key} style={{color:"#64748b",lineHeight:1.8}}>{key}: <span style={{color:"#1e293b"}}>{value}</span></div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
