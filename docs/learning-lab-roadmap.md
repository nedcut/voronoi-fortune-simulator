# Voronoi and Computational Geometry Learning Lab Roadmap

This checklist tracks the path from the current Fortune sweep visualizer to a broader computational geometry learning lab.

## Foundation

- [ ] Split the current single-file visualizer into focused modules.
  - [ ] Geometry primitives and helpers.
  - [ ] Diagram engines.
  - [ ] Canvas rendering helpers.
  - [ ] Shared site editing and interaction state.
  - [ ] Sidebar/data-structure inspectors.
- [ ] Define a common diagram result shape for cells, edges, vertices, debug data, and structures.
- [ ] Keep the current Fortune sweep experience working during each refactor.
- [ ] Add small regression examples for known site sets and degeneracies.
- [ ] Make app state shareable through URL params.

## Voronoi Modes

- [ ] Static Euclidean point-site Voronoi diagrams.
- [ ] Fortune sweep animation for Euclidean point-site diagrams.
- [ ] Lp metric diagrams.
  - [ ] L1 / Manhattan.
  - [ ] L2 / Euclidean.
  - [ ] L-infinity / Chebyshev.
  - [ ] Configurable p value.
- [ ] Additively weighted Voronoi diagrams.
- [ ] Multiplicatively weighted Voronoi diagrams.
- [ ] Power diagrams / Laguerre diagrams.
- [ ] Furthest-site Voronoi diagrams.
- [ ] Order-k / k-nearest Voronoi diagrams.
- [ ] Voronoi diagrams clipped to arbitrary bounding polygons.
- [ ] Segment-site Voronoi diagrams.
- [ ] Polygon-site Voronoi diagrams.
- [ ] Obstacle-aware / geodesic Voronoi sketches.

## Computational Geometry Companions

- [ ] Delaunay triangulation dual view.
- [ ] Convex hull visualizer.
- [ ] Half-plane intersection visualizer.
- [ ] Line segment intersection sweep.
- [ ] Point location demos.
- [ ] Nearest-neighbor data structures.
  - [ ] kd-tree.
  - [ ] quadtree.
  - [ ] uniform grid.
- [ ] DCEL explorer that works across multiple diagram engines.
- [ ] Robust predicates lab.
  - [ ] orientation test.
  - [ ] incircle test.
  - [ ] degeneracy examples.
- [ ] Minkowski unit-ball view for metric intuition.
- [ ] Complexity counters and operation traces.

## Learning Experience

- [ ] Add a lesson map.
  - [ ] What is distance?
  - [ ] Cells and bisectors.
  - [ ] Delaunay duality.
  - [ ] Sweep algorithms.
  - [ ] Data structures.
  - [ ] Degenerate cases.
- [ ] Add curated presets for important cases.
- [ ] Add compare mode for viewing the same sites under two diagrams or metrics.
- [ ] Add an inspector that explains the selected edge, cell, or event.
- [ ] Add concise glossary entries for important terms.
- [ ] Add challenge mode.
  - [ ] Predict which cell owns a point.
  - [ ] Identify the next Fortune event.
  - [ ] Spot invalid circle events.
- [ ] Add export tools.
  - [ ] PNG.
  - [ ] SVG.
  - [ ] JSON state.

## Implementation Milestones

- [ ] Milestone 1: extract reusable diagram and rendering foundations.
- [ ] Milestone 2: add a Diagram Explorer shell with a mode picker.
- [ ] Milestone 3: add Metric Lab with L1, L2, and L-infinity.
- [ ] Milestone 4: add compare mode and curated presets.
- [ ] Milestone 5: add Delaunay dual and robust predicate views.
- [ ] Milestone 6: add weighted, furthest-site, and order-k diagrams.
- [ ] Milestone 7: add segment and polygon sites.
- [ ] Milestone 8: polish lessons, challenges, sharing, and exports.

## First Slice

- [ ] Create small geometry helper modules without changing behavior.
- [ ] Move canvas constants and shared distance functions out of the React component.
- [ ] Add a diagram mode registry with the current Fortune visualizer as the first mode.
- [ ] Add a Metric Lab placeholder route or mode behind the same canvas shell.
- [ ] Verify with `bun run build`.
