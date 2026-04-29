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
  - [x] Configurable p value.
  - [x] Experimental negative p values.
- [ ] Additively weighted Voronoi diagrams.
- [ ] Multiplicatively weighted Voronoi diagrams.
- [x] Wavefront growth view with additive starts and multiplicative speeds.
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
- [ ] 3D computational geometry extension.
  - [ ] 3D Voronoi cells.
  - [ ] 3D Delaunay tetrahedralization.
  - [ ] 3D convex hulls.
  - [ ] Three.js camera controls and slicing planes.
- [ ] Complexity counters and operation traces.

## Learning Experience

- [x] Add a lesson map.
  - [x] Represent geometry: DCELs, predicates, containment tests.
  - [x] Build Voronoi diagrams: Fortune, incremental insertion, divide-and-conquer.
  - [x] Use Voronoi/Delaunay: nearest neighbors, empty circles, triangulations.
  - [x] Optimize over geometry: MWT and containment-by-translation.
  - [x] Store/query spatial data: quadtrees, octrees, k-d trees, range search.
  - [ ] Add per-lesson readings and short exercises.
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

- [x] Milestone 1: extract reusable diagram and rendering foundations.
- [x] Milestone 2: add a Diagram Explorer shell with a mode picker.
- [x] Milestone 3: add Metric Lab with L1, L2, and L-infinity.
- [ ] Milestone 4: add compare mode and curated presets.
- [ ] Milestone 5: add Delaunay dual and robust predicate views.
  - [x] Delaunay triangulation lab with empty circumcircle inspector.
  - [x] Minimum-weight triangulation dynamic-programming lab.
  - [ ] Voronoi/Delaunay compare overlay.
  - [ ] Robust predicate view.
- [ ] Milestone 6: add weighted, furthest-site, and order-k diagrams.
- [ ] Milestone 7: add segment and polygon sites.
- [ ] Milestone 8: polish lessons, challenges, sharing, and exports.

## Study Guide Spine

This is the broader study-guide structure. The local course notes are useful inspiration, but the app should read as a general computational geometry guide.

- [x] Functional Study Hub landing mode with topic tracks and homepage demos.
- [ ] Shared DCEL explorer for vertices, faces, half-edges, twins, next, and prev links.
- [x] Fortune sweep lab with event queue, beachline tree, and DCEL panels.
- [ ] Incremental Voronoi insertion lab.
- [ ] Divide-and-conquer merge lab for the separating chain sigma(SL, SR).
- [x] Delaunay triangulation lab with empty-circle inspector.
- [ ] Voronoi/Delaunay compare overlay and nearest-neighbor application gallery.
- [x] MWT dynamic-programming table for convex polygon triangulation.
- [ ] Broader triangulation playground for greedy, Delaunay, and MWT comparisons.
- [ ] Convex polygon containment-by-translation lab.
- [ ] Deepest arrangement point / P180 duality lab.
- [ ] Quadtree builder with W/delta bad-case controls.
- [ ] K-d tree comparison with orthogonal and radius range queries.

## Next Best Slices

1. Turn the Fortune sidebar into a reusable DCEL Explorer that can inspect any planar subdivision lab.
2. Build the Quadtree/KD-tree comparison lab, since it is independent of the Voronoi engine.
3. Connect Delaunay edges back to Voronoi cell adjacencies in a compare view.
4. Add a robust predicates lab that explains orientation, incircle, and degeneracy handling.

## First Slice

- [x] Create small geometry helper modules without changing behavior.
- [x] Move canvas constants and shared distance functions out of the React component.
- [x] Add a diagram mode registry with the current Fortune visualizer as the first mode.
- [x] Add a Metric Lab mode behind the same app shell.
- [x] Share point state between Fortune Sweep and Metric Lab.
- [x] Verify with `bun run build`.

## Learning Hub Slice

- [x] Add general study-guide data in `src/studyGuideData.js`.
- [x] Add `Study Hub` as the default app mode.
- [x] Link built modules back into the existing Fortune, Metric, and Wavefront labs.
- [x] Add compact homepage demos for Voronoi cells, sweep state, and Delaunay duality.

## Delaunay Slice

- [x] Add shared orientation, circumcenter, and Bowyer-Watson triangulation helpers.
- [x] Add `Delaunay Lab` mode with draggable points, presets, empty circumcircles, and triangle inspection.
- [x] Link the Delaunay module from the Study Hub and homepage demos.

## MWT Slice

- [x] Add shared minimum-weight triangulation DP helper for convex polygons.
- [x] Add `MWT Lab` mode with polygon presets, selected subproblems, best splits, and DP table cells.
- [x] Link the MWT module from the Study Hub and homepage demos.
