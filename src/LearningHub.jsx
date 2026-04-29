import { NEXT_BUILD_SLICES, STUDY_TRACKS } from "./studyGuideData.js";

const statusStyles = {
  built: { background: "#dcfce7", color: "#166534", border: "#86efac" },
  "partly built": { background: "#e0f2fe", color: "#075985", border: "#7dd3fc" },
  planned: { background: "#f8fafc", color: "#475569", border: "#cbd5e1" },
};

const demoSites = [
  { x: 52, y: 64, color: "#ef6461" },
  { x: 122, y: 42, color: "#2563eb" },
  { x: 166, y: 106, color: "#16a34a" },
  { x: 74, y: 142, color: "#ca8a04" },
];
const demoColors = demoSites.map(site => site.color);

function StatusPill({ status }) {
  const style = statusStyles[status] ?? statusStyles.planned;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      border: `1px solid ${style.border}`,
      borderRadius: 999,
      background: style.background,
      color: style.color,
      padding: "4px 8px",
      fontSize: 11,
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      {status}
    </span>
  );
}

function MiniVoronoiDemo() {
  return (
    <svg viewBox="0 0 220 170" role="img" aria-label="Small Voronoi diagram demo" style={{ width: "100%", height: 170, display: "block" }}>
      <rect x="0" y="0" width="220" height="170" fill="#f8fafc" />
      <path d="M0 0 L92 0 L74 87 L0 111 Z" fill="#fee2e2" />
      <path d="M92 0 L220 0 L220 73 L130 86 L74 87 Z" fill="#dbeafe" />
      <path d="M220 73 L220 170 L126 170 L130 86 Z" fill="#dcfce7" />
      <path d="M0 111 L74 87 L130 86 L126 170 L0 170 Z" fill="#fef3c7" />
      <path d="M92 0 L74 87 L0 111 M74 87 L130 86 L220 73 M130 86 L126 170" fill="none" stroke="#334155" strokeWidth="1.4" strokeLinecap="round" />
      {demoSites.map(site => (
        <g key={`${site.x}-${site.y}`}>
          <circle cx={site.x} cy={site.y} r="8" fill="#ffffff" stroke="#0f172a" strokeWidth="2" />
          <circle cx={site.x} cy={site.y} r="4" fill={site.color} />
        </g>
      ))}
    </svg>
  );
}

function MiniSweepDemo() {
  return (
    <svg viewBox="0 0 220 170" role="img" aria-label="Sweep line and beachline demo" style={{ width: "100%", height: 170, display: "block" }}>
      <rect x="0" y="0" width="220" height="170" fill="#f8fafc" />
      <line x1="128" y1="12" x2="128" y2="158" stroke="#2563eb" strokeWidth="2.4" strokeDasharray="6 5" />
      <path d="M18 132 C42 64, 82 64, 106 132" fill="none" stroke="#ef6461" strokeWidth="2.2" />
      <path d="M70 138 C96 44, 138 44, 164 138" fill="none" stroke="#2563eb" strokeWidth="2.2" />
      <path d="M124 132 C150 68, 184 68, 204 132" fill="none" stroke="#16a34a" strokeWidth="2.2" />
      <circle cx="52" cy="64" r="5" fill="#ef6461" />
      <circle cx="122" cy="42" r="5" fill="#2563eb" />
      <circle cx="166" cy="106" r="5" fill="#16a34a" />
      <g fill="#0f172a" fontFamily="'JetBrains Mono', monospace" fontSize="10">
        <text x="136" y="24">sweep</text>
        <text x="22" y="152">beachline arcs</text>
      </g>
    </svg>
  );
}

function MiniTreeDemo() {
  const cells = [
    [0, 0, 110, 85], [110, 0, 55, 42], [165, 0, 55, 42], [110, 42, 110, 43],
    [0, 85, 55, 42], [55, 85, 55, 42], [0, 127, 110, 43], [110, 85, 110, 85],
  ];
  const points = [[30, 36], [132, 20], [194, 24], [152, 63], [28, 105], [79, 104], [66, 150], [174, 125]];
  return (
    <svg viewBox="0 0 220 170" role="img" aria-label="Spatial tree demo" style={{ width: "100%", height: 170, display: "block" }}>
      <rect x="0" y="0" width="220" height="170" fill="#f8fafc" />
      {cells.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}-${w}-${h}`} x={x} y={y} width={w} height={h} fill="none" stroke="#94a3b8" strokeWidth="1.2" />
      ))}
      <rect x="118" y="95" width="74" height="42" fill="#fee2e2" stroke="#dc2626" strokeWidth="1.4" strokeDasharray="5 4" />
      {points.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4.2" fill="#0f766e" />
      ))}
      <text x="122" y="151" fill="#0f172a" fontFamily="'JetBrains Mono', monospace" fontSize="10">range query</text>
    </svg>
  );
}

function MiniDelaunayDemo() {
  const points = [
    [54, 48], [124, 34], [178, 76], [82, 126], [154, 132],
  ];
  const triangles = [
    [points[0], points[1], points[3]],
    [points[1], points[2], points[4]],
    [points[1], points[3], points[4]],
  ];
  return (
    <svg viewBox="0 0 220 170" role="img" aria-label="Delaunay triangulation demo" style={{ width: "100%", height: 170, display: "block" }}>
      <rect x="0" y="0" width="220" height="170" fill="#f8fafc" />
      <circle cx="119" cy="83" r="66" fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="5 4" />
      {triangles.map((triangle, index) => (
        <path
          key={index}
          d={`M${triangle[0][0]} ${triangle[0][1]} L${triangle[1][0]} ${triangle[1][1]} L${triangle[2][0]} ${triangle[2][1]} Z`}
          fill={index === 2 ? "rgba(124,58,237,0.12)" : "rgba(37,99,235,0.07)"}
          stroke="#0f172a"
          strokeWidth="1.5"
        />
      ))}
      {points.map(([x, y], index) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="7" fill="#ffffff" stroke="#0f172a" strokeWidth="2" />
          <circle cx={x} cy={y} r="3.5" fill={demoColors[index % demoColors.length]} />
        </g>
      ))}
      <text x="22" y="153" fill="#0f172a" fontFamily="'JetBrains Mono', monospace" fontSize="10">empty circle check</text>
    </svg>
  );
}

function MiniMWTDemo() {
  const points = [
    [42, 72], [98, 30], [176, 48], [190, 112], [130, 144], [62, 132],
  ];
  const diagonals = [[0, 2], [2, 4], [0, 4]];
  return (
    <svg viewBox="0 0 220 170" role="img" aria-label="Minimum weight triangulation dynamic program demo" style={{ width: "100%", height: 170, display: "block" }}>
      <rect x="0" y="0" width="220" height="170" fill="#f8fafc" />
      <path
        d={`M${points.map(([x, y]) => `${x} ${y}`).join(" L")} Z`}
        fill="rgba(180,83,9,0.09)"
        stroke="#0f172a"
        strokeWidth="1.7"
      />
      {diagonals.map(([a, b], index) => (
        <line
          key={`${a}-${b}`}
          x1={points[a][0]}
          y1={points[a][1]}
          x2={points[b][0]}
          y2={points[b][1]}
          stroke={index === 1 ? "#2563eb" : "#b45309"}
          strokeWidth={index === 1 ? 2.7 : 1.8}
          strokeDasharray={index === 1 ? "" : "6 4"}
        />
      ))}
      {points.map(([x, y], index) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="7" fill="#ffffff" stroke="#0f172a" strokeWidth="2" />
          <text x={x} y={y + 0.5} fill="#0f172a" textAnchor="middle" dominantBaseline="middle" fontFamily="'JetBrains Mono', monospace" fontSize="8" fontWeight="700">{index}</text>
        </g>
      ))}
      <g fontFamily="'JetBrains Mono', monospace" fontSize="9">
        <rect x="22" y="14" width="68" height="20" rx="5" fill="#ffffff" stroke="#cbd5e1" />
        <text x="31" y="28" fill="#0f172a">M[i,j]</text>
        <text x="116" y="155" fill="#0f172a">best split k</text>
      </g>
    </svg>
  );
}

function DemoTile({ title, label, children, modeId, onOpenMode }) {
  return (
    <article style={{
      border: "1px solid #d7dee8",
      borderRadius: 8,
      background: "#ffffff",
      overflow: "hidden",
      display: "grid",
      minHeight: 260,
    }}>
      <div style={{ borderBottom: "1px solid #e2e8f0" }}>
        {children}
      </div>
      <div style={{ padding: 14, display: "grid", gap: 10, alignContent: "start" }}>
        <div>
          <h3 style={{ fontSize: 15, color: "#0f172a", marginBottom: 4 }}>{title}</h3>
          <p style={{ color: "#64748b", fontSize: 12, lineHeight: 1.4 }}>{label}</p>
        </div>
        {modeId ? (
          <button
            onClick={() => onOpenMode(modeId)}
            style={{
              justifySelf: "start",
              border: "1px solid #cbd5e1",
              borderRadius: 7,
              background: "#f8fafc",
              color: "#0f172a",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 800,
              padding: "8px 10px",
            }}
          >
            Open Lab
          </button>
        ) : null}
      </div>
    </article>
  );
}

function TrackCard({ track, onOpenMode }) {
  return (
    <section style={{
      border: "1px solid #d7dee8",
      borderRadius: 8,
      background: "#ffffff",
      overflow: "hidden",
    }}>
      <div style={{
        borderTop: `4px solid ${track.color}`,
        padding: "14px 16px 12px",
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "flex-start",
      }}>
        <div>
          <h2 style={{ fontSize: 17, lineHeight: 1.2, color: "#0f172a", marginBottom: 5 }}>
            {track.label}
          </h2>
          <p style={{ color: "#475569", fontSize: 13, lineHeight: 1.4 }}>
            {track.summary}
          </p>
        </div>
        <span style={{
          color: track.color,
          background: `${track.color}12`,
          border: `1px solid ${track.color}33`,
          borderRadius: 999,
          padding: "5px 9px",
          fontSize: 11,
          fontWeight: 800,
          whiteSpace: "nowrap",
        }}>
          {track.category}
        </span>
      </div>
      <div style={{ display: "grid", borderTop: "1px solid #e2e8f0" }}>
        {track.modules.map((module, index) => (
          <article
            key={module.title}
            style={{
              padding: "12px 16px",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              borderTop: index ? "1px solid #edf2f7" : "none",
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 5 }}>
                <h3 style={{ fontSize: 14, color: "#172033", lineHeight: 1.25 }}>
                  {module.title}
                </h3>
                <StatusPill status={module.status} />
              </div>
              <p style={{ color: "#475569", fontSize: 12, lineHeight: 1.4, marginBottom: 5 }}>
                {module.idea}
              </p>
              <p style={{ color: "#64748b", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                {module.topic}
              </p>
            </div>
            {module.nextMode ? (
              <button
                onClick={() => onOpenMode(module.nextMode)}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 7,
                  background: "#f8fafc",
                  color: "#0f172a",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                  padding: "8px 10px",
                  minWidth: 74,
                }}
              >
                Open
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function LearningHub({ setActiveModeId }) {
  const modules = STUDY_TRACKS.flatMap(track => track.modules);
  const liveModules = modules.filter(module => module.status !== "planned");
  const plannedModules = modules.filter(module => module.status === "planned");
  const openMode = modeId => {
    if (setActiveModeId) setActiveModeId(modeId);
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "#eef2f6",
      color: "#0f172a",
      fontFamily: "'DM Sans', sans-serif",
      padding: "18px 16px 40px",
    }}>
      <div style={{ width: "100%", maxWidth: 1220, margin: "0 auto", display: "grid", gap: 18 }}>
        <section style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          gap: 16,
          alignItems: "start",
        }}>
          <aside style={{
            border: "1px solid #d7dee8",
            borderRadius: 8,
            background: "#ffffff",
            padding: 16,
            display: "grid",
            gap: 14,
          }}>
            <div>
              <h1 style={{ fontSize: 30, lineHeight: 1.05, letterSpacing: 0, marginBottom: 10 }}>
                Computational Geometry
              </h1>
              <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.5 }}>
                A practical index of visual explanations, algorithm workbenches, and small checks for planar geometry.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: 10 }}>
                <strong style={{ display: "block", fontSize: 21 }}>{STUDY_TRACKS.length}</strong>
                <span style={{ color: "#64748b", fontSize: 11 }}>areas</span>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: 10 }}>
                <strong style={{ display: "block", fontSize: 21 }}>{liveModules.length}</strong>
                <span style={{ color: "#64748b", fontSize: 11 }}>usable</span>
              </div>
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: 10 }}>
                <strong style={{ display: "block", fontSize: 21 }}>{plannedModules.length}</strong>
                <span style={{ color: "#64748b", fontSize: 11 }}>queued</span>
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <h2 style={{ fontSize: 14 }}>Study Areas</h2>
              {STUDY_TRACKS.map(track => (
                <a
                  key={track.id}
                  href={`#${track.id}`}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderLeft: `4px solid ${track.color}`,
                    borderRadius: 7,
                    background: "#f8fafc",
                    color: "#172033",
                    textDecoration: "none",
                    padding: "9px 10px",
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {track.label}
                </a>
              ))}
            </div>
          </aside>

          <section style={{ display: "grid", gap: 12 }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
              gap: 12,
            }}>
              <DemoTile
                title="Voronoi Cells"
                label="Cells are regions of equal nearest-site ownership."
                modeId="metric-lab"
                onOpenMode={openMode}
              >
                <MiniVoronoiDemo />
              </DemoTile>
              <DemoTile
                title="Sweep State"
                label="A moving directrix leaves a changing beachline behind it."
                modeId="fortune"
                onOpenMode={openMode}
              >
                <MiniSweepDemo />
              </DemoTile>
              <DemoTile
                title="Delaunay Triangles"
                label="Empty circumcircles turn Voronoi adjacency into a graph."
                modeId="delaunay-lab"
                onOpenMode={openMode}
              >
                <MiniDelaunayDemo />
              </DemoTile>
              <DemoTile
                title="MWT Dynamic Program"
                label="Polygon triangulations can be explored one subproblem at a time."
                modeId="mwt-lab"
                onOpenMode={openMode}
              >
                <MiniMWTDemo />
              </DemoTile>
            </div>
            <section style={{
              border: "1px solid #d7dee8",
              borderRadius: 8,
              background: "#ffffff",
              padding: 14,
            }}>
              <h2 style={{ fontSize: 15, marginBottom: 9 }}>Build Queue</h2>
              <ol style={{ display: "grid", gap: 7, paddingLeft: 18, color: "#475569", fontSize: 13, lineHeight: 1.4 }}>
                {NEXT_BUILD_SLICES.map(slice => (
                  <li key={slice}>{slice}</li>
                ))}
              </ol>
            </section>
          </section>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14 }}>
          {STUDY_TRACKS.map(track => (
            <div id={track.id} key={track.id}>
              <TrackCard track={track} onOpenMode={openMode} />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
