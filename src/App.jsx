import { useMemo, useState } from "react";
import { DEFAULT_DIAGRAM_MODE_ID, DIAGRAM_MODES } from "./diagramModes.js";

export default function App() {
  const [activeModeId, setActiveModeId] = useState(DEFAULT_DIAGRAM_MODE_ID);
  const activeMode = useMemo(
    () => DIAGRAM_MODES.find(mode => mode.id === activeModeId) ?? DIAGRAM_MODES[0],
    [activeModeId],
  );
  const ActiveComponent = activeMode.component;

  return (
    <div>
      <nav style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        display: "flex",
        justifyContent: "center",
        gap: 6,
        padding: "10px 12px",
        background: "rgba(226,232,240,0.88)",
        borderBottom: "1px solid rgba(148,163,184,0.45)",
        backdropFilter: "blur(12px)",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {DIAGRAM_MODES.map(mode => {
          const active = mode.id === activeMode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setActiveModeId(mode.id)}
              style={{
                background: active ? "#0f172a" : "#ffffff",
                color: active ? "#ffffff" : "#334155",
                border: `1px solid ${active ? "#0f172a" : "#cbd5e1"}`,
                borderRadius: 7,
                padding: "7px 13px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: active ? 700 : 500,
              }}
            >
              {mode.label}
            </button>
          );
        })}
      </nav>
      <ActiveComponent />
    </div>
  );
}
