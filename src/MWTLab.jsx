import { useEffect, useMemo, useRef, useState } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, TARGET_RENDER_WIDTH } from "./appConstants.js";
import { buildMinimumWeightTriangulation, distance, isPolygonBoundaryEdge } from "./geometry.js";

const PRESETS = {
  pentagon: [
    { x: 196, y: 138 },
    { x: 418, y: 72 },
    { x: 654, y: 146 },
    { x: 588, y: 376 },
    { x: 260, y: 394 },
  ],
  hexagon: [
    { x: 178, y: 168 },
    { x: 326, y: 84 },
    { x: 594, y: 108 },
    { x: 708, y: 274 },
    { x: 532, y: 414 },
    { x: 250, y: 388 },
  ],
  awkward: [
    { x: 126, y: 192 },
    { x: 286, y: 88 },
    { x: 526, y: 78 },
    { x: 716, y: 206 },
    { x: 654, y: 358 },
    { x: 436, y: 430 },
    { x: 206, y: 360 },
  ],
};

function formatWeight(value) {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(1);
}

function drawGrid(ctx) {
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = "rgba(148,163,184,0.26)";
  for (let x = 20; x < CANVAS_WIDTH; x += 40) {
    for (let y = 20; y < CANVAS_HEIGHT; y += 40) {
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function selectedSubproblemDiagonals(selected, choice, count) {
  if (!selected || choice == null) return [];
  const { i, j } = selected;
  return [[i, choice], [choice, j]].filter(([a, b]) => !isPolygonBoundaryEdge(a, b, count));
}

function drawMWT(ctx, vertices, result, selected) {
  const renderScale = ctx.canvas.width / CANVAS_WIDTH;
  const selectedChoice = selected ? result.choices[selected.i][selected.j] : null;
  const selectedDiagonals = selectedSubproblemDiagonals(selected, selectedChoice, vertices.length);
  const selectedDiagonalKeys = new Set(selectedDiagonals.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));

  ctx.save();
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawGrid(ctx);

  if (vertices.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
    ctx.closePath();
    ctx.fillStyle = "rgba(124,58,237,0.065)";
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  if (selected && selectedChoice != null) {
    const a = vertices[selected.i];
    const b = vertices[selectedChoice];
    const c = vertices[selected.j];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.fillStyle = "rgba(37,99,235,0.13)";
    ctx.fill();
  }

  for (const diagonal of result.diagonals) {
    const a = vertices[diagonal.a];
    const b = vertices[diagonal.b];
    const selectedEdge = selectedDiagonalKeys.has(diagonal.id);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = selectedEdge ? "#2563eb" : "#7c3aed";
    ctx.lineWidth = selectedEdge ? 3.2 : 2;
    ctx.setLineDash(selectedEdge ? [] : [7, 5]);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i];
    const active = selected && (i === selected.i || i === selected.j || i === selectedChoice);
    ctx.beginPath();
    ctx.arc(vertex.x, vertex.y, active ? 11 : 9, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = active ? "#2563eb" : "#0f172a";
    ctx.lineWidth = active ? 3 : 2;
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 11px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${i}`, vertex.x, vertex.y);
  }

  ctx.restore();
}

export default function MWTLab() {
  const [vertices, setVertices] = useState(PRESETS.hexagon);
  const [selected, setSelected] = useState({ i: 0, j: PRESETS.hexagon.length - 1 });
  const canvasRef = useRef(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const renderScale = Math.max(dpr, TARGET_RENDER_WIDTH / CANVAS_WIDTH);
  const renderBufferWidth = Math.round(CANVAS_WIDTH * renderScale);
  const renderBufferHeight = Math.round(CANVAS_HEIGHT * renderScale);
  const result = useMemo(() => buildMinimumWeightTriangulation(vertices), [vertices]);
  const validCells = useMemo(() => {
    const cells = [];
    for (let span = 2; span < vertices.length; span++) {
      for (let i = 0; i + span < vertices.length; i++) {
        cells.push({ i, j: i + span });
      }
    }
    return cells;
  }, [vertices.length]);
  const selectedChoice = selected ? result.choices[selected.i][selected.j] : null;
  const selectedWeight = selected ? result.table[selected.i][selected.j] : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawMWT(canvas.getContext("2d"), vertices, result, selected);
  }, [vertices, result, selected]);

  const setPreset = preset => {
    setVertices(preset);
    setSelected({ i: 0, j: preset.length - 1 });
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
    fontWeight: active ? 800 : 600,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#e7edf4", color: "#1e293b", fontFamily: "'DM Sans',sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 1120, display: "grid", gap: 14 }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "0 0 2px" }}>
            <span style={{ color: "#b45309" }}>◆</span> Minimum Weight Triangulation
            {" "}
            <span style={{ color: "#64748b", fontWeight: 400, fontSize: 16, marginLeft: 8 }}>Convex Polygon DP</span>
          </h1>
          <p style={{ color: "#64748b", fontSize: 12, margin: 0, fontFamily: "'JetBrains Mono',monospace" }}>
            Pick a subproblem M[i,j] to see its best split k and the diagonals it contributes
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 14, alignItems: "start" }}>
          <section style={{ display: "grid", gap: 12 }}>
            <div style={{ width: "100%", maxWidth: CANVAS_WIDTH, justifySelf: "center", borderRadius: 18, overflow: "hidden", border: "1px solid #cbd5e1", boxShadow: "0 10px 30px rgba(15,23,42,0.09), inset 0 1px 0 rgba(255,255,255,0.5)" }}>
              <canvas
                ref={canvasRef}
                width={renderBufferWidth}
                height={renderBufferHeight}
                style={{ width: `min(${CANVAS_WIDTH}px,calc(100vw - 32px))`, height: "auto", display: "block" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 4, background: "#ffffff", borderRadius: 10, padding: 4, border: "1px solid #cbd5e1", alignItems: "center" }}>
                {Object.entries(PRESETS).map(([id, preset]) => (
                  <button key={id} onClick={() => setPreset(preset)} style={buttonStyle(vertices.length === preset.length && vertices[0].x === preset[0].x)}>
                    {id}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, background: "#ffffff", borderRadius: 10, padding: 4, border: "1px solid #cbd5e1", alignItems: "center" }}>
                <button onClick={() => setSelected({ i: 0, j: vertices.length - 1 })} style={buttonStyle(selected?.i === 0 && selected?.j === vertices.length - 1)}>
                  Full Problem
                </button>
              </div>
            </div>
          </section>

          <aside style={{ display: "grid", gap: 10 }}>
            <section style={{ background: "#ffffff", borderRadius: 10, padding: "12px 14px", border: "1px solid #cbd5e1", fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
              <div style={{ color: "#475569", fontWeight: 800, marginBottom: 6, fontFamily: "'DM Sans',sans-serif", fontSize: 14 }}>Current Subproblem</div>
              <div style={{ color: "#64748b", lineHeight: 1.8 }}>cell: <span style={{ color: "#1e293b" }}>{selected ? `M[${selected.i},${selected.j}]` : "-"}</span></div>
              <div style={{ color: "#64748b", lineHeight: 1.8 }}>best split: <span style={{ color: "#1e293b" }}>{selectedChoice ?? "-"}</span></div>
              <div style={{ color: "#64748b", lineHeight: 1.8 }}>diagonal weight: <span style={{ color: "#1e293b" }}>{formatWeight(selectedWeight)}</span></div>
              <div style={{ color: "#64748b", lineHeight: 1.8 }}>total polygon weight: <span style={{ color: "#1e293b" }}>{formatWeight(result.totalWeight)}</span></div>
            </section>

            <section style={{ background: "#ffffff", borderRadius: 10, padding: "12px 14px", border: "1px solid #cbd5e1" }}>
              <div style={{ color: "#475569", fontWeight: 800, marginBottom: 8, fontSize: 14 }}>DP Table</div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${vertices.length}, minmax(34px, 1fr))`, gap: 5 }}>
                {Array.from({ length: vertices.length * vertices.length }, (_, flatIndex) => {
                  const i = Math.floor(flatIndex / vertices.length);
                  const j = flatIndex % vertices.length;
                  const value = i <= j ? result.table[i][j] : null;
                  const selectable = i + 2 <= j;
                  const active = selected?.i === i && selected?.j === j;
                  return (
                    <button
                      key={`${i}-${j}`}
                      disabled={!selectable}
                      onClick={() => setSelected({ i, j })}
                      title={selectable ? `M[${i},${j}]` : ""}
                      style={{
                        minHeight: 34,
                        border: `1px solid ${active ? "#2563eb" : "#e2e8f0"}`,
                        borderRadius: 7,
                        background: active ? "#dbeafe" : selectable ? "#f8fafc" : "#ffffff",
                        color: selectable ? "#172033" : "#cbd5e1",
                        cursor: selectable ? "pointer" : "default",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 10,
                        padding: 2,
                      }}
                    >
                      {value == null ? "" : selectable ? Math.round(value) : "0"}
                    </button>
                  );
                })}
              </div>
            </section>

            <section style={{ background: "#ffffff", borderRadius: 10, padding: "12px 14px", border: "1px solid #cbd5e1" }}>
              <div style={{ color: "#475569", fontWeight: 800, marginBottom: 8, fontSize: 14 }}>Subproblems by Size</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {validCells.map(cell => {
                  const active = selected?.i === cell.i && selected?.j === cell.j;
                  return (
                    <button
                      key={`${cell.i}-${cell.j}`}
                      onClick={() => setSelected(cell)}
                      style={{
                        border: `1px solid ${active ? "#2563eb" : "#cbd5e1"}`,
                        borderRadius: 999,
                        background: active ? "#dbeafe" : "#f8fafc",
                        color: "#172033",
                        cursor: "pointer",
                        fontSize: 11,
                        fontFamily: "'JetBrains Mono',monospace",
                        padding: "5px 8px",
                      }}
                    >
                      {cell.i},{cell.j}
                    </button>
                  );
                })}
              </div>
            </section>
          </aside>
        </div>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
          <div style={{ background: "#ffffff", borderRadius: 10, padding: "12px 16px", border: "1px solid #cbd5e1" }}>
            <strong style={{ display: "block", color: "#475569", fontFamily: "'DM Sans',sans-serif", fontSize: 14, marginBottom: 6 }}>Recurrence</strong>
            <span style={{ color: "#64748b", lineHeight: 1.8 }}>M[i,j] = min over k of M[i,k] + M[k,j] + new diagonals</span>
          </div>
          <div style={{ background: "#ffffff", borderRadius: 10, padding: "12px 16px", border: "1px solid #cbd5e1" }}>
            <strong style={{ display: "block", color: "#475569", fontFamily: "'DM Sans',sans-serif", fontSize: 14, marginBottom: 6 }}>Why Convex?</strong>
            <span style={{ color: "#64748b", lineHeight: 1.8 }}>Any diagonal stays inside the polygon, so each split cleanly creates two smaller polygons.</span>
          </div>
          <div style={{ background: "#ffffff", borderRadius: 10, padding: "12px 16px", border: "1px solid #cbd5e1" }}>
            <strong style={{ display: "block", color: "#475569", fontFamily: "'DM Sans',sans-serif", fontSize: 14, marginBottom: 6 }}>Diagonals</strong>
            <span style={{ color: "#64748b", lineHeight: 1.8 }}>{result.diagonals.length} chosen diagonals, {formatWeight(result.diagonalWeight)} total diagonal length</span>
          </div>
        </section>
      </div>
    </div>
  );
}
