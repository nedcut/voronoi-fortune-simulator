import MetricLab from "./MetricLab.jsx";
import VoronoiVisualizer from "./VoronoiVisualizer.jsx";

export const DEFAULT_DIAGRAM_MODE_ID = "fortune";

export const DIAGRAM_MODES = [
  {
    id: "fortune",
    label: "Fortune Sweep",
    component: VoronoiVisualizer,
  },
  {
    id: "metric-lab",
    label: "Metric Lab",
    component: MetricLab,
  },
];
