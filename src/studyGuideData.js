export const STUDY_TRACKS = [
  {
    id: "represent",
    label: "Represent Geometry",
    summary: "DCELs, predicates, and the vocabulary needed to describe planar subdivisions.",
    color: "#0f766e",
    category: "foundations",
    modules: [
      {
        title: "DCEL Explorer",
        status: "partly built",
        topic: "planar subdivisions",
        idea: "Click vertices, faces, and half-edges to trace origin, twin, next, prev, and incident face links.",
        nextMode: "fortune",
      },
      {
        title: "Robust Predicates Lab",
        status: "planned",
        topic: "orientation and degeneracy",
        idea: "Practice orientation, left-turn, on-segment, and incircle tests on near-degenerate inputs.",
      },
    ],
  },
  {
    id: "build-voronoi",
    label: "Build Voronoi Diagrams",
    summary: "Fortune sweep, incremental insertion, and divide-and-conquer construction.",
    color: "#2563eb",
    category: "construction",
    modules: [
      {
        title: "Fortune Sweep",
        status: "built",
        topic: "sweep-line algorithms",
        idea: "Watch the event queue, beachline tree, breakpoints, unfinished edges, and DCEL grow together.",
        nextMode: "fortune",
      },
      {
        title: "Incremental Voronoi",
        status: "planned",
        topic: "dynamic construction",
        idea: "Insert one site at a time, locate its containing cell, and trace the new region boundary.",
      },
      {
        title: "Divide-and-Conquer Merge",
        status: "planned",
        topic: "recursive construction",
        idea: "Build the separating chain sigma(SL, SR), then discard and merge the left and right diagrams.",
      },
    ],
  },
  {
    id: "use-voronoi",
    label: "Use Voronoi and Delaunay",
    summary: "Nearest neighbors, largest empty circles, Delaunay duality, and triangulation quality.",
    color: "#7c3aed",
    category: "duality and applications",
    modules: [
      {
        title: "Metric Voronoi Lab",
        status: "built",
        topic: "distance models",
        idea: "Compare L1, L2, L-infinity, and custom Lp cells with the same site set.",
        nextMode: "metric-lab",
      },
      {
        title: "Delaunay Dual View",
        status: "built",
        topic: "geometric duality",
        idea: "Show which Voronoi neighbors become Delaunay edges and why empty circumcircles matter.",
        nextMode: "delaunay-lab",
      },
      {
        title: "Triangulation Playground",
        status: "partly built",
        topic: "triangulation quality",
        idea: "Compare greedy edges, Delaunay angles, and minimum-weight triangulation goals.",
        nextMode: "mwt-lab",
      },
      {
        title: "MWT Dynamic Program",
        status: "built",
        topic: "optimization",
        idea: "Fill M[i,j], choose split k, and watch convex polygon subproblems combine.",
        nextMode: "mwt-lab",
      },
    ],
  },
  {
    id: "optimize",
    label: "Optimize Over Geometry",
    summary: "Point containment by translation, stable placements, and arrangement depth.",
    color: "#b45309",
    category: "arrangements",
    modules: [
      {
        title: "Containment by Translation",
        status: "planned",
        topic: "configuration spaces",
        idea: "Move a convex polygon over points and identify stable placements with two contacts.",
      },
      {
        title: "Deepest Arrangement Point",
        status: "planned",
        topic: "duality",
        idea: "Flip to P180 copies and see why the best translation is a deepest point in an arrangement.",
      },
      {
        title: "Arrangement Plane Sweep",
        status: "planned",
        topic: "sweep-line depth",
        idea: "Maintain active upper/lower polygon chains and update region depth at event points.",
      },
    ],
  },
  {
    id: "query",
    label: "Store and Query Spatial Data",
    summary: "Quadtrees, k-d trees, bad cases, and range or nearest-neighbor queries.",
    color: "#dc2626",
    category: "spatial indexing",
    modules: [
      {
        title: "Quadtree Builder",
        status: "planned",
        topic: "hierarchical grids",
        idea: "Insert points, split leaves by capacity c, and expose the W/delta bad-case depth.",
      },
      {
        title: "KD-Tree Comparison",
        status: "planned",
        topic: "adaptive partitioning",
        idea: "Compare median splits with quadtree cells on clustered and well-spaced point sets.",
      },
      {
        title: "Range Query Sketchpad",
        status: "planned",
        topic: "query pruning",
        idea: "Draw orthogonal and in-radius ranges, then inspect which tree nodes can be pruned.",
      },
    ],
  },
];

export const NEXT_BUILD_SLICES = [
  "Turn the Fortune sidebar into the shared DCEL Explorer for every planar subdivision lab.",
  "Add a Quadtree/KD-tree lab because it is independent, visual, and useful across applications.",
  "Connect Delaunay edges back to Voronoi cell adjacencies in a compare view.",
  "Add a robust predicates lab that explains orientation, incircle, and degeneracy handling.",
];
