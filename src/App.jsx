import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_DIAGRAM_MODE_ID, DIAGRAM_MODES } from "./diagramModes.js";

function modeFromHash() {
  if (typeof window === "undefined") return DEFAULT_DIAGRAM_MODE_ID;
  const id = window.location.hash.replace(/^#/, "");
  return DIAGRAM_MODES.some(mode => mode.id === id) ? id : DEFAULT_DIAGRAM_MODE_ID;
}

export default function App() {
  const [activeModeId, setActiveModeId] = useState(modeFromHash);
  const [contentMinHeight, setContentMinHeight] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState(1);
  const contentRef = useRef(null);
  const [sites, setSites] = useState([]);
  const [metric, setMetric] = useState("l2");
  const [customP, setCustomP] = useState(3);
  const [customPInput, setCustomPInput] = useState("3");
  const activeMode = useMemo(
    () => DIAGRAM_MODES.find(mode => mode.id === activeModeId) ?? DIAGRAM_MODES[0],
    [activeModeId],
  );
  const ActiveComponent = activeMode.component;
  const updateMode = useCallback(modeId => {
    setActiveModeId(currentModeId => {
      if (modeId === currentModeId) return currentModeId;
      const currentIndex = DIAGRAM_MODES.findIndex(mode => mode.id === currentModeId);
      const nextIndex = DIAGRAM_MODES.findIndex(mode => mode.id === modeId);
      setTransitionDirection(nextIndex >= currentIndex ? 1 : -1);
      return modeId;
    });
  }, []);
  const selectMode = useCallback(modeId => {
    updateMode(modeId);
    if (typeof window !== "undefined" && window.location.hash !== `#${modeId}`) {
      window.history.replaceState(null, "", `#${modeId}`);
    }
  }, [updateMode]);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return undefined;

    const syncHeight = () => {
      setContentMinHeight(Math.ceil(element.getBoundingClientRect().height));
    };
    syncHeight();

    if (typeof ResizeObserver === "undefined") return undefined;
    const resizeObserver = new ResizeObserver(syncHeight);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [activeModeId]);

  useEffect(() => {
    const onHashChange = () => updateMode(modeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [updateMode]);

  return (
    <div>
      <nav style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        display: "flex",
        justifyContent: "center",
        flexWrap: "wrap",
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
              onClick={() => selectMode(mode.id)}
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
      <style>{`
        @keyframes tabPaneIn {
          from {
            opacity: 0.42;
            transform: translateX(calc(var(--tab-direction, 1) * 14px)) scale(0.992);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .tab-pane {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
      <main
        style={{
          minHeight: contentMinHeight || undefined,
          transition: "min-height 180ms ease",
        }}
      >
        <div
          key={activeModeId}
          ref={contentRef}
          className="tab-pane"
          style={{
            "--tab-direction": transitionDirection,
            animation: "tabPaneIn 180ms ease both",
            willChange: "opacity, transform",
          }}
        >
          <ActiveComponent
            sites={sites}
            setSites={setSites}
            metric={metric}
            setMetric={setMetric}
            customP={customP}
            setCustomP={setCustomP}
            customPInput={customPInput}
            setCustomPInput={setCustomPInput}
            setActiveModeId={selectMode}
          />
        </div>
      </main>
    </div>
  );
}
