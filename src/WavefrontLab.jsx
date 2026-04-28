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

const SAMPLE_SIZE = 4;
const DEFAULT_START_RADIUS = 0;
const DEFAULT_SPEED = 1;
const MIN_FINISH_TIME = 80;

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

function formatNumber(value) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function getSiteControl(controls, index) {
  return controls[index] ?? { startRadius: DEFAULT_START_RADIUS, speed: DEFAULT_SPEED };
}

function normalizeControls(controls, siteCount) {
  return Array.from({ length: siteCount }, (_, index) => ({
    startRadius: getSiteControl(controls, index).startRadius,
    speed: getSiteControl(controls, index).speed,
  }));
}

function arrivalTime(point, site, control, p) {
  const speed = Math.max(0.05, control.speed);
  return Math.max(0, (lpDistance(point, site, p) - control.startRadius) / speed);
}

function ownerAt(point, sites, controls, p) {
  let owner = -1;
  let bestArrival = Infinity;
  for (let i = 0; i < sites.length; i++) {
    const t = arrivalTime(point, sites[i], getSiteControl(controls, i), p);
    if (t < bestArrival) {
      bestArrival = t;
      owner = i;
    }
  }
  return { owner, arrival: bestArrival };
}

function computeFinishTime(sites, controls, p) {
  if (!sites.length) return MIN_FINISH_TIME;
  let maxArrival = MIN_FINISH_TIME;
  for (let x = 0; x < CANVAS_WIDTH; x += SAMPLE_SIZE) {
    for (let y = 0; y < CANVAS_HEIGHT; y += SAMPLE_SIZE) {
      const point = { x: x + SAMPLE_SIZE / 2, y: y + SAMPLE_SIZE / 2 };
      const result = ownerAt(point, sites, controls, p);
      if (Number.isFinite(result.arrival)) maxArrival = Math.max(maxArrival, result.arrival);
    }
  }
  return Math.ceil(maxArrival + 4);
}

function unitBallPoint(theta, radius, p) {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  if (p === Infinity) {
    const denom = Math.max(Math.abs(cos), Math.abs(sin));
    return { x: (cos / denom) * radius, y: (sin / denom) * radius };
  }
  const safeP = Math.abs(p) < 0.1 ? 0.1 : p;
  const denom = (Math.abs(cos) ** safeP + Math.abs(sin) ** safeP) ** (1 / safeP);
  return { x: (cos / denom) * radius, y: (sin / denom) * radius };
}

function nearestSiteIndex(point, sites, maxDistance = 18) {
  let best = -1;
  let bestDistance = maxDistance;
  for (let i = 0; i < sites.length; i++) {
    const d = lpDistance(point, sites[i], 2);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

function drawWavefront(ctx, sites, controls, p, time, highlightedSiteIndex = null) {
  const renderScale = ctx.canvas.width / CANVAS_WIDTH;
  const hasHighlight = highlightedSiteIndex != null;
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
    for (let x = 0; x < CANVAS_WIDTH; x += SAMPLE_SIZE) {
      for (let y = 0; y < CANVAS_HEIGHT; y += SAMPLE_SIZE) {
        const point = { x: x + SAMPLE_SIZE / 2, y: y + SAMPLE_SIZE / 2 };
        const { owner, arrival: bestArrival } = ownerAt(point, sites, controls, p);
        if (owner === -1 || bestArrival > time) continue;
        const rgb = hexToRgb(colorForSite(owner));
        const freshness = Math.max(0, Math.min(1, 1 - (time - bestArrival) / 80));
        const highlightBoost = hasHighlight && owner === highlightedSiteIndex ? 0.12 : 0;
        const dim = hasHighlight && owner !== highlightedSiteIndex ? 0.45 : 1;
        const alpha = (0.16 + freshness * 0.1 + highlightBoost) * dim;
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
        ctx.fillRect(x, y, SAMPLE_SIZE, SAMPLE_SIZE);
      }
    }

    for (let i = 0; i < sites.length; i++) {
      const site = sites[i];
      const control = getSiteControl(controls, i);
      const radius = Math.max(0, control.startRadius + control.speed * time);
      ctx.save();
      ctx.strokeStyle = colorForSite(i);
      ctx.globalAlpha = hasHighlight && i !== highlightedSiteIndex ? 0.18 : 0.7;
      ctx.lineWidth = hasHighlight && i === highlightedSiteIndex ? 3 : 2;
      ctx.setLineDash([7, 5]);
      const steps = 180;
      let drawing = false;
      for (let step = 0; step <= steps; step++) {
        const point = unitBallPoint((step / steps) * Math.PI * 2, radius, p);
        const px = site.x + point.x;
        const py = site.y + point.y;
        const inCanvas = px >= 0 && px <= CANVAS_WIDTH && py >= 0 && py <= CANVAS_HEIGHT;
        const { owner } = ownerAt({ x: px, y: py }, sites, controls, p);
        const visible = inCanvas && owner === i;
        if (visible && !drawing) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          drawing = true;
        } else if (visible) {
          ctx.lineTo(px, py);
        } else if (drawing) {
          ctx.stroke();
          drawing = false;
        }
      }
      if (drawing) ctx.stroke();
      ctx.restore();
    }
  }

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const highlighted = i === highlightedSiteIndex;
    if (highlighted) {
      ctx.fillStyle = `${colorForSite(i)}33`;
      ctx.beginPath();
      ctx.arc(site.x, site.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = hasHighlight && !highlighted ? 0.42 : 1;
    ctx.fillStyle = colorForSite(i);
    ctx.beginPath();
    ctx.arc(site.x, site.y, highlighted ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(site.x, site.y, highlighted ? 3.6 : 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (!sites.length) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px 'DM Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Click anywhere to place wavefront sites", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 8);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "13px 'DM Sans', sans-serif";
    ctx.fillText("Then press Play to watch regions grow", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 16);
  }

  ctx.restore();
}

export default function WavefrontLab({ sites: controlledSites, setSites: setControlledSites } = {}) {
  const [localSites, setLocalSites] = useState([]);
  const sites = controlledSites ?? localSites;
  const setSites = setControlledSites ?? setLocalSites;
  const [controls, setControls] = useState([]);
  const [metric, setMetric] = useState("l2");
  const [customP, setCustomP] = useState(3);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hoveredSiteIndex, setHoveredSiteIndex] = useState(null);
  const previousFrame = useRef(0);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const dragging = useRef(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const renderScale = Math.max(dpr, TARGET_RENDER_WIDTH / CANVAS_WIDTH);
  const renderBufferWidth = Math.round(CANVAS_WIDTH * renderScale);
  const renderBufferHeight = Math.round(CANVAS_HEIGHT * renderScale);
  const selectedMetric = METRICS.find(item => item.id === metric) ?? METRICS[1];
  const metricP = selectedMetric.p ?? customP;
  const finishTime = useMemo(
    () => computeFinishTime(sites, controls, metricP),
    [sites, controls, metricP],
  );

  useEffect(() => {
    setControls(current => normalizeControls(current, sites.length));
  }, [sites.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawWavefront(canvas.getContext("2d"), sites, controls, metricP, time, hoveredSiteIndex);
  }, [sites, controls, metricP, time, hoveredSiteIndex]);

  useEffect(() => {
    if (!playing) return;
    let running = true;
    const tick = timestamp => {
      if (!running) return;
      if (!previousFrame.current) previousFrame.current = timestamp;
      const dt = Math.min(0.05, (timestamp - previousFrame.current) / 1000);
      previousFrame.current = timestamp;
      setTime(current => {
        const next = Math.min(finishTime, current + dt * 38);
        if (next >= finishTime) setPlaying(false);
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      previousFrame.current = 0;
      cancelAnimationFrame(rafRef.current);
    };
  }, [playing, finishTime]);

  useEffect(() => {
    setTime(current => Math.min(current, finishTime));
  }, [finishTime]);

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
    const index = nearestSiteIndex(point, sites, 15);
    if (index !== -1) {
      setHoveredSiteIndex(index);
      dragging.current = { index, startX: point.x, startY: point.y, moved: false };
      return;
    }
    dragging.current = null;
  }, [canvasPoint, sites]);

  const handleCanvasMove = useCallback(event => {
    const current = dragging.current;
    const point = canvasPoint(event);
    if (!current) {
      const index = nearestSiteIndex(point, sites, 18);
      setHoveredSiteIndex(index === -1 ? null : index);
      return;
    }
    const x = Math.max(5, Math.min(CANVAS_WIDTH - 5, point.x));
    const y = Math.max(5, Math.min(CANVAS_HEIGHT - 5, point.y));
    if (!current.moved && lpDistance({ x, y }, { x: current.startX, y: current.startY }, 2) < 3) return;
    current.moved = true;
    setHoveredSiteIndex(current.index);
    setSites(sites => {
      if (!sites[current.index]) return sites;
      const next = [...sites];
      next[current.index] = { x, y };
      return next;
    });
  }, [canvasPoint, sites, setSites]);

  const endDragSite = useCallback(() => {
    if (dragging.current) setTimeout(() => { dragging.current = null; }, 0);
  }, []);

  const updateControl = useCallback((siteIndex, key, value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setControls(current => {
      const next = normalizeControls(current, sites.length);
      next[siteIndex] = {
        ...next[siteIndex],
        [key]: key === "speed"
          ? Math.max(0.05, Math.min(4, parsed))
          : Math.max(0, Math.min(160, parsed)),
      };
      return next;
    });
  }, [sites.length]);

  const sliderStyle = {
    width: "100%",
    accentColor: "#ca8a04",
    cursor: "pointer",
  };

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
            <span style={{color:"#ca8a04"}}>◆</span> Wavefront Lab
            <span style={{color:"#64748b",fontWeight:400,fontSize:16,marginLeft:8}}>Growing Unit Balls</span>
          </h1>
          <p style={{color:"#64748b",fontSize:12,margin:0,fontFamily:"'JetBrains Mono',monospace"}}>
            Click to add sites · Right-click to remove · t={formatNumber(time)}
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
            onMouseMove={handleCanvasMove}
            onMouseUp={endDragSite}
            onMouseLeave={() => {
              endDragSite();
              setHoveredSiteIndex(null);
            }}
            style={{width:`min(${CANVAS_WIDTH}px,calc(100vw - 32px))`,height:"auto",cursor:dragging.current ? "grabbing" : "crosshair",display:"block"}}
          />
        </div>

        <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",alignItems:"center"}}>
          <div style={{display:"flex",gap:4,background:"#ffffff",borderRadius:10,padding:4,border:"1px solid #cbd5e1",alignItems:"center"}}>
            <button onClick={() => setPlaying(current => !current)} style={buttonStyle(playing)}>
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => { setPlaying(false); setTime(0); }} style={buttonStyle(false)}>Reset</button>
          </div>
          <div style={{display:"flex",gap:8,background:"#ffffff",borderRadius:10,padding:"6px 14px",border:"1px solid #cbd5e1",alignItems:"center"}}>
            <input
              type="range"
              min={0}
              max={finishTime}
              step={0.5}
              value={time}
              onChange={event => {
                setPlaying(false);
                setTime(Number(event.target.value));
              }}
              style={{width:150,accentColor:"#ca8a04",cursor:"pointer"}}
            />
            <span style={{fontSize:10,color:"#64748b",fontFamily:"'JetBrains Mono',monospace"}}>time</span>
          </div>
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
              min={0.2}
              max={8}
              step={0.1}
              value={customP}
              onChange={event => {
                setMetric("custom");
                setCustomP(Number(event.target.value));
              }}
              disabled={metric !== "custom"}
              style={{width:100,accentColor:"#ca8a04",cursor:metric === "custom" ? "pointer" : "default"}}
            />
            <span style={{fontSize:10,color:"#64748b",fontFamily:"'JetBrains Mono',monospace"}}>p={formatNumber(customP)}</span>
          </div>
        </div>

        <div style={{marginTop:16,maxWidth:CANVAS_WIDTH,width:"100%",display:"grid",gridTemplateColumns:"minmax(260px, 1fr) minmax(260px, 1fr)",gap:10,fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>
          <div style={{background:"#ffffff",borderRadius:10,padding:"12px 16px",border:"1px solid #cbd5e1"}}>
            <div style={{color:"#475569",fontWeight:500,marginBottom:6,fontFamily:"'DM Sans',sans-serif",fontSize:13}}>Growth Model</div>
            <div style={{color:"#64748b",lineHeight:1.8}}>radius: <span style={{color:"#1e293b"}}>start + speed * time</span></div>
            <div style={{color:"#64748b",lineHeight:1.8}}>owner: <span style={{color:"#1e293b"}}>earliest arrival</span></div>
            <div style={{color:"#64748b",lineHeight:1.8}}>metric: <span style={{color:"#1e293b"}}>{selectedMetric.label === "Lp" ? `L${formatNumber(customP)}` : selectedMetric.label}</span></div>
          </div>
          <div style={{background:"#ffffff",borderRadius:10,padding:"12px 16px",border:"1px solid #cbd5e1"}}>
            <div style={{color:"#475569",fontWeight:500,marginBottom:6,fontFamily:"'DM Sans',sans-serif",fontSize:13}}>Site Controls</div>
            {!sites.length ? (
              <div style={{color:"#64748b",lineHeight:1.8}}>Add sites to tune their start radius and speed.</div>
            ) : sites.map((site, index) => {
              const control = getSiteControl(controls, index);
              const highlighted = hoveredSiteIndex === index;
              return (
                <div
                  key={index}
                  onMouseEnter={() => setHoveredSiteIndex(index)}
                  onMouseLeave={() => setHoveredSiteIndex(null)}
                  style={{
                    display:"grid",
                    gridTemplateColumns:"42px minmax(0, 1fr)",
                    gap:10,
                    alignItems:"center",
                    marginTop:index ? 10 : 0,
                    padding:"8px 10px",
                    borderRadius:8,
                    border:`1px solid ${highlighted ? colorForSite(index) : "#e2e8f0"}`,
                    background:highlighted ? `${colorForSite(index)}14` : "#f8fafc",
                  }}
                >
                  <span style={{color:colorForSite(index),fontWeight:700}}>s{index}</span>
                  <div style={{display:"grid",gap:8}}>
                    <label style={{display:"grid",gridTemplateColumns:"42px 1fr 38px",gap:8,alignItems:"center",color:"#64748b"}}>
                      start
                      <input
                        type="range"
                        min={0}
                        max={160}
                        step={1}
                        value={control.startRadius}
                        onChange={event => updateControl(index, "startRadius", event.target.value)}
                        style={sliderStyle}
                      />
                      <span style={{color:"#334155",textAlign:"right"}}>{formatNumber(control.startRadius)}</span>
                    </label>
                    <label style={{display:"grid",gridTemplateColumns:"42px 1fr 38px",gap:8,alignItems:"center",color:"#64748b"}}>
                      speed
                      <input
                        type="range"
                        min={0.05}
                        max={4}
                        step={0.05}
                        value={control.speed}
                        onChange={event => updateControl(index, "speed", event.target.value)}
                        style={sliderStyle}
                      />
                      <span style={{color:"#334155",textAlign:"right"}}>{formatNumber(control.speed)}</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
