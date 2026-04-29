import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, TARGET_RENDER_WIDTH } from "./appConstants.js";
import { buildDelaunayTriangulation, distance } from "./geometry.js";

const SITE_COLORS = [
  "#ef6461", "#2563eb", "#16a34a", "#ca8a04", "#9333ea",
  "#db2777", "#0d9488", "#ea580c", "#4f46e5", "#dc2626",
];

const PRESETS = {
  simple: [
    { x: 196, y: 116 },
    { x: 430, y: 74 },
    { x: 652, y: 140 },
    { x: 312, y: 296 },
    { x: 560, y: 338 },
  ],
  circle: Array.from({ length: 9 }, (_, index) => {
    const theta = (Math.PI * 2 * index) / 9 - Math.PI / 2;
    return {
      x: CANVAS_WIDTH / 2 + Math.cos(theta) * 250,
      y: CANVAS_HEIGHT / 2 + Math.sin(theta) * 170,
    };
  }),
  skinny: [
    { x: 126, y: 130 },
    { x: 260, y: 188 },
    { x: 390, y: 218 },
    { x: 520, y: 250 },
    { x: 682, y: 318 },
    { x: 348, y: 110 },
    { x: 458, y: 392 },
  ],
};

function colorForSite(index) {
  return SITE_COLORS[index % SITE_COLORS.length];
}

function drawGrid(ctx) {
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
}

function drawDelaunay(ctx, sites, triangulation, selectedTriangleId, showCircles) {
  const renderScale = ctx.canvas.width / CANVAS_WIDTH;
  ctx.save();
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawGrid(ctx);

  for (const triangle of triangulation.triangles) {
    const selected = triangle.id === selectedTriangleId;
    const [a, b, c] = triangle.siteIds.map(index => sites[index]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fillStyle = selected ? "rgba(37,99,235,0.13)" : "rgba(124,58,237,0.055)";
    ctx.fill();
  }

  if (showCircles) {
    for (const triangle of triangulation.triangles) {
      const selected = triangle.id === selectedTriangleId;
      ctx.beginPath();
      ctx.arc(triangle.center.x, triangle.center.y, triangle.radius, 0, Math.PI * 2);
      ctx.strokeStyle = selected ? "rgba(37,99,235,0.68)" : "rgba(100,116,139,0.24)";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
    }
  }

  for (const edge of triangulation.edges) {
    const a = sites[edge.a];
    const b = sites[edge.b];
    const selected = edge.triangleIds.includes(selectedTriangleId);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = selected ? "#2563eb" : "#0f172a";
    ctx.lineWidth = selected ? 3 : 1.7;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    ctx.beginPath();
    ctx.arc(site.x, site.y, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0f172a";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(site.x, site.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = colorForSite(i);
    ctx.fill();
  }

  if (!sites.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 20px 'DM Sans', sans-serif";
    ctx.fillText("Click to add points", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 8);
    ctx.font = "13px 'DM Sans', sans-serif";
    ctx.fillText("The Delaunay graph appears after the first triangle is possible", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 16);
  }

  ctx.restore();
}

function nearestTriangle(point, sites, triangles) {
  let best = null;
  let bestDistance = 34;
  for (const triangle of triangles) {
    const centroid = triangle.siteIds.reduce(
      (acc, index) => ({ x: acc.x + sites[index].x / 3, y: acc.y + sites[index].y / 3 }),
      { x: 0, y: 0 },
    );
    const d = distance(point, centroid);
    if (d < bestDistance) {
      best = triangle;
      bestDistance = d;
    }
  }
  return best;
}

export default function DelaunayLab({
  sites: controlledSites,
  setSites: setControlledSites,
} = {}) {
  const [localSites, setLocalSites] = useState(PRESETS.simple);
  const [showCircles, setShowCircles] = useState(true);
  const [selectedTriangleId, setSelectedTriangleId] = useState(null);
  const sites = controlledSites ?? localSites;
  const setSites = setControlledSites ?? setLocalSites;
  const canvasRef = useRef(null);
  const dragging = useRef(null);
  const seededInitialSites = useRef(false);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const renderScale = Math.max(dpr, TARGET_RENDER_WIDTH / CANVAS_WIDTH);
  const renderBufferWidth = Math.round(CANVAS_WIDTH * renderScale);
  const renderBufferHeight = Math.round(CANVAS_HEIGHT * renderScale);
  const triangulation = useMemo(() => buildDelaunayTriangulation(sites), [sites]);
  const selectedTriangle = triangulation.triangles.find(triangle => triangle.id === selectedTriangleId) ?? null;

  useEffect(() => {
    if (seededInitialSites.current || sites.length) return;
    seededInitialSites.current = true;
    setSites(PRESETS.simple);
  }, [sites.length, setSites]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawDelaunay(canvas.getContext("2d"), sites, triangulation, selectedTriangleId, showCircles);
  }, [sites, triangulation, selectedTriangleId, showCircles]);

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
      if (distance(point, site) < 15) return;
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
        const d = distance(point, current[i]);
        if (d < bestDistance) {
          best = i;
          bestDistance = d;
        }
      }
      return best === -1 ? current : current.filter((_, index) => index !== best);
    });
    setSelectedTriangleId(null);
  }, [canvasPoint, setSites]);

  const startDragSite = useCallback(event => {
    if (event.button !== 0) return;
    const point = canvasPoint(event);
    for (let i = 0; i < sites.length; i++) {
      if (distance(point, sites[i]) < 15) {
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
    if (!current.moved && distance({ x, y }, { x: current.startX, y: current.startY }) < 3) return;
    current.moved = true;
    setSites(previous => {
      if (!previous[current.index]) return previous;
      const next = [...previous];
      next[current.index] = { x, y };
      return next;
    });
  }, [canvasPoint, setSites]);

  const endDragSite = useCallback(() => {
    if (dragging.current) setTimeout(() => { dragging.current = null; }, 0);
  }, []);

  const selectTriangle = useCallback(event => {
    const triangle = nearestTriangle(canvasPoint(event), sites, triangulation.triangles);
    setSelectedTriangleId(triangle?.id ?? null);
    return triangle;
  }, [canvasPoint, sites, triangulation.triangles]);

  const addRandom = useCallback(count => {
    setSites(current => {
      const next = [...current];
      for (let i = 0; i < count; i++) {
        next.push({
          x: 50 + Math.random() * (CANVAS_WIDTH - 100),
          y: 50 + Math.random() * (CANVAS_HEIGHT - 100),
        });
      }
      return next;
    });
  }, [setSites]);

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
    <div style={{ minHeight: "100vh", background: "#e7edf4", color: "#1e293b", fontFamily: "'DM Sans',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 1060, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ textAlign: "center", marginBottom: 14, maxWidth: CANVAS_WIDTH, width: "100%" }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "0 0 2px" }}>
            <span style={{ color: "#7c3aed" }}>◆</span> Delaunay Lab
            {" "}
            <span style={{ color: "#64748b", fontWeight: 400, fontSize: 16, marginLeft: 8 }}>Voronoi Dual and Empty Circles</span>
          </h1>
          <p style={{ color: "#64748b", fontSize: 12, margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>
            Click to add points · Drag points · Right-click to remove · Click near a triangle center to inspect it
          </p>
        </div>

        <div style={{ width: "100%", maxWidth: CANVAS_WIDTH, position: "relative", borderRadius: 18, overflow: "hidden", border: "1px solid #cbd5e1", boxShadow: "0 10px 30px rgba(15,23,42,0.09), inset 0 1px 0 rgba(255,255,255,0.5)", flexShrink: 0 }}>
          <canvas
            ref={canvasRef}
            width={renderBufferWidth}
            height={renderBufferHeight}
            onClick={event => {
              const triangle = selectTriangle(event);
              if (!triangle) addSite(event);
            }}
            onContextMenu={removeSite}
            onMouseDown={startDragSite}
            onMouseMove={dragSite}
            onMouseUp={endDragSite}
            onMouseLeave={endDragSite}
            style={{ width: `min(${CANVAS_WIDTH}px,calc(100vw - 32px))`, height: "auto", cursor: dragging.current ? "grabbing" : "crosshair", display: "block" }}
          />
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 4, background: "#ffffff", borderRadius: 10, padding: 4, border: "1px solid #cbd5e1", alignItems: "center" }}>
            <button onClick={() => setShowCircles(value => !value)} style={buttonStyle(showCircles)}>
              Empty Circles
            </button>
            <button onClick={() => setSelectedTriangleId(null)} style={buttonStyle(false)}>
              Clear Selection
            </button>
          </div>
          <div style={{ display: "flex", gap: 4, background: "#ffffff", borderRadius: 10, padding: 4, border: "1px solid #cbd5e1", alignItems: "center" }}>
            {Object.entries(PRESETS).map(([id, preset]) => (
              <button key={id} onClick={() => {
                setSites(preset);
                setSelectedTriangleId(null);
              }} style={buttonStyle(false)}>
                {id}
              </button>
            ))}
            <button onClick={() => addRandom(6)} style={buttonStyle(false)}>+6</button>
            <button onClick={() => {
              setSites([]);
              setSelectedTriangleId(null);
            }} style={{ ...buttonStyle(false), color: "#dc2626" }}>Clear</button>
          </div>
        </div>

        <div style={{ marginTop: 16, maxWidth: CANVAS_WIDTH, width: "100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
          <div style={{ background: "#ffffff", borderRadius: 10, padding: "12px 16px", border: "1px solid #cbd5e1" }}>
            <div style={{ color: "#475569", fontWeight: 700, marginBottom: 6, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>Triangulation</div>
            <div style={{ color: "#64748b", lineHeight: 1.8 }}>points: <span style={{ color: "#1e293b" }}>{sites.length}</span></div>
            <div style={{ color: "#64748b", lineHeight: 1.8 }}>triangles: <span style={{ color: "#1e293b" }}>{triangulation.triangles.length}</span></div>
            <div style={{ color: "#64748b", lineHeight: 1.8 }}>edges: <span style={{ color: "#1e293b" }}>{triangulation.edges.length}</span></div>
          </div>
          <div style={{ background: "#ffffff", borderRadius: 10, padding: "12px 16px", border: "1px solid #cbd5e1" }}>
            <div style={{ color: "#475569", fontWeight: 700, marginBottom: 6, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>Selected Triangle</div>
            {selectedTriangle ? (
              <>
                <div style={{ color: "#64748b", lineHeight: 1.8 }}>sites: <span style={{ color: "#1e293b" }}>{selectedTriangle.siteIds.map(index => index + 1).join(", ")}</span></div>
                <div style={{ color: "#64748b", lineHeight: 1.8 }}>radius: <span style={{ color: "#1e293b" }}>{selectedTriangle.radius.toFixed(1)}</span></div>
                <div style={{ color: "#64748b", lineHeight: 1.8 }}>area: <span style={{ color: "#1e293b" }}>{selectedTriangle.area.toFixed(1)}</span></div>
              </>
            ) : (
              <div style={{ color: "#64748b", lineHeight: 1.8 }}>click a triangle to inspect its empty circle</div>
            )}
          </div>
          <div style={{ background: "#ffffff", borderRadius: 10, padding: "12px 16px", border: "1px solid #cbd5e1" }}>
            <div style={{ color: "#475569", fontWeight: 700, marginBottom: 6, fontFamily: "'DM Sans',sans-serif", fontSize: 13 }}>Why This Matters</div>
            <div style={{ color: "#64748b", lineHeight: 1.8 }}>empty circle: <span style={{ color: "#1e293b" }}>no point inside</span></div>
            <div style={{ color: "#64748b", lineHeight: 1.8 }}>dual edge: <span style={{ color: "#1e293b" }}>neighboring Voronoi cells</span></div>
            <div style={{ color: "#64748b", lineHeight: 1.8 }}>use: <span style={{ color: "#1e293b" }}>nearest-neighbor graph</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
