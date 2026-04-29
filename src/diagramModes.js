import DelaunayLab from "./DelaunayLab.jsx";
import LearningHub from "./LearningHub.jsx";
import MetricLab from "./MetricLab.jsx";
import MWTLab from "./MWTLab.jsx";
import VoronoiVisualizer from "./VoronoiVisualizer.jsx";
import WavefrontLab from "./WavefrontLab.jsx";

export const DEFAULT_DIAGRAM_MODE_ID = "learning-hub";

export const DIAGRAM_MODES = [
  {
    id: "learning-hub",
    label: "Study Hub",
    component: LearningHub,
  },
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
  {
    id: "delaunay-lab",
    label: "Delaunay Lab",
    component: DelaunayLab,
  },
  {
    id: "mwt-lab",
    label: "MWT Lab",
    component: MWTLab,
  },
  {
    id: "wavefront-lab",
    label: "Wavefront Lab",
    component: WavefrontLab,
  },
];
