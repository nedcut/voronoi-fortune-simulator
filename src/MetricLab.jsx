import { useCallback, useEffect, useRef, useState } from "react";
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

function nearestSiteIndex(point, sites, p) {
  let best = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < sites.length; i++) {
    const d = lpDistance(point, sites[i], p);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

function drawUnitBall(ctx, p, x, y, size) {
  const radius = size / 2;
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
  ctx.beginPath();
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const denom = p === Infinity
      ? Math.max(Math.abs(cos), Math.abs(sin))
      : (Math.abs(cos) ** p + Math.abs(sin) ** p) ** (1 / p);
    const r = radius * 0.72 / denom;
    const px = cos * r;
    const py = sin * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = "#475569";
  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.textAlign = "center";
  ctx.fillText(p === Infinity ? "unit ball L∞" : `unit ball L${p}`, 0, radius - 10);
  ctx.restore();
}

function drawMetricDiagram(ctx, sites, metricP) {
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
    const cellSize = 5;
    for (let x = 0; x < CANVAS_WIDTH; x += cellSize) {
      for (let y = 0; y < CANVAS_HEIGHT; y += cellSize) {
        const index = nearestSiteIndex({ x: x + cellSize / 2, y: y + cellSize / 2 }, sites, metricP);
        const rgb = hexToRgb(colorForSite(index));
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.14)`;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }

    ctx.strokeStyle = "rgba(15,23,42,0.22)";
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH - cellSize; x += cellSize) {
      for (let y = 0; y < CANVAS_HEIGHT - cellSize; y += cellSize) {
        const here = nearestSiteIndex({ x, y }, sites, metricP);
        const right = nearestSiteIndex({ x: x + cellSize, y }, sites, metricP);
        const down = nearestSiteIndex({ x, y: y + cellSize }, sites, metricP);
        if (here !== right) {
          ctx.beginPath();
          ctx.moveTo(x + cellSize, y);
          ctx.lineTo(x + cellSize, y + cellSize);
          ctx.stroke();
        }
        if (here !== down) {
          ctx.beginPath();
          ctx.moveTo(x, y + cellSize);
          ctx.lineTo(x + cellSize, y + cellSize);
          ctx.stroke();
        }
      }
    }
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

export default function MetricLab() {
  const [sites, setSites] = useState([
    { x: 210, y: 160 },
    { x: 470, y: 120 },
    { x: 650, y: 340 },
    { x: 280, y: 390 },
  ]);
  const [metric, setMetric] = useState("l2");
  const [customP, setCustomP] = useState(3);
  const canvasRef = useRef(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const renderScale = Math.max(dpr, TARGET_RENDER_WIDTH / CANVAS_WIDTH);
  const renderBufferWidth = Math.round(CANVAS_WIDTH * renderScale);
  const renderBufferHeight = Math.round(CANVAS_HEIGHT * renderScale);
  const selectedMetric = METRICS.find(item => item.id === metric) ?? METRICS[1];
  const metricP = selectedMetric.p ?? customP;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawMetricDiagram(canvas.getContext("2d"), sites, metricP);
  }, [sites, metricP]);

  const canvasPoint = useCallback(event => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (CANVAS_WIDTH / rect.width),
      y: (event.clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
    };
  }, []);

  const addSite = useCallback(event => {
    const point = canvasPoint(event);
    if (point.x < 5 || point.x > CANVAS_WIDTH - 5 || point.y < 5 || point.y > CANVAS_HEIGHT - 5) return;
    setSites(current => [...current, point]);
  }, [canvasPoint]);

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
  }, [canvasPoint]);

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
            Click to add sites · Right-click to remove · Current metric: {selectedMetric.label === "Lp" ? `L${customP}` : selectedMetric.label}
          </p>
        </div>

        <div style={{width:"100%",maxWidth:CANVAS_WIDTH,position:"relative",borderRadius:18,overflow:"hidden",border:"1px solid #cbd5e1",boxShadow:"0 10px 30px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.5)",flexShrink:0}}>
          <canvas
            ref={canvasRef}
            width={renderBufferWidth}
            height={renderBufferHeight}
            onClick={addSite}
            onContextMenu={removeSite}
            style={{width:`min(${CANVAS_WIDTH}px,calc(100vw - 32px))`,height:"auto",cursor:"crosshair",display:"block"}}
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
              min={1.2}
              max={8}
              step={0.1}
              value={customP}
              onChange={event => setCustomP(Number(event.target.value))}
              disabled={metric !== "custom"}
              style={{width:120,accentColor:"#0d9488",cursor:metric === "custom" ? "pointer" : "default"}}
            />
            <span style={{fontSize:10,color:"#64748b",fontFamily:"'JetBrains Mono',monospace"}}>p={customP.toFixed(1)}</span>
          </div>
          <div style={{display:"flex",gap:4,background:"#ffffff",borderRadius:10,padding:4,border:"1px solid #cbd5e1",alignItems:"center"}}>
            <button onClick={addRandom} style={buttonStyle(false)}>+5</button>
            <button onClick={() => setSites([])} style={{...buttonStyle(false),color:"#dc2626"}}>Clear</button>
          </div>
        </div>

        <div style={{marginTop:16,maxWidth:CANVAS_WIDTH,width:"100%",display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:10,fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>
          {[
            ["Metric", [["Distance", selectedMetric.label === "Lp" ? `(|dx|^p + |dy|^p)^(1/p)` : selectedMetric.label], ["p", metricP === Infinity ? "infinity" : `${metricP}`], ["Sites", `${sites.length}`]]],
            ["Reading Cells", [["Color", "nearest site"], ["Dark seams", "sampled boundaries"], ["Inset", "unit ball"]]],
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
