# Voronoi Diagram — Fortune's Sweep Line Visualizer

An interactive, educational visualization of **Fortune's algorithm** for computing Voronoi diagrams. Built for computational geometry courses.

![Voronoi Diagram](https://img.shields.io/badge/algorithm-Fortune's_Sweep-38bdf8?style=flat-square) ![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square) ![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square)

## Live Demo

**[Try it in your browser](https://nedcut.github.io/voronoi-fortune-simulator/)** — no install required.

## Features

- **Click to place** Voronoi sites — right-click to remove
- **Continuous sweep line** moves smoothly left-to-right, processing algorithm events in real time
- **Beachline visualization** with colored parabolic arcs per site
- **Circle events** fade in as the sweep approaches, with triggered circles highlighted
- **Growing edges** trace from their origin to the current breakpoint
- **Speed control** from 10 px/s (lecture pace) to 800 px/s
- **Layer toggles** for sweep line, beachline, circle events, and edges
- **Step-through mode** — pause and skip to the next event
- **Live preview** of the final Voronoi diagram while placing sites
- **Robust handling** of degenerate cases (collinear sites, near-duplicates, fast clicking)

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## How It Works

Fortune's algorithm computes Voronoi diagrams in O(n log n) by sweeping a vertical line left-to-right across the plane:

1. **Site events** — when the sweep line hits a new site, a parabolic arc is inserted into the beachline
2. **Circle events** — when three consecutive arcs converge, their circumcenter becomes a Voronoi vertex
3. **Beachline** — the frontier of parabolic arcs, each defined by a site (focus) and the sweep line (directrix)
4. **Edges** grow along the breakpoints between adjacent arcs

The visualization renders all of this in real time using HTML Canvas, with the beachline computed at the current (interpolated) sweep position for smooth animation between discrete algorithm events.

## Project Structure

```
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx              # Entry point
    └── VoronoiVisualizer.jsx # Algorithm + visualization (single file)
```

## Build

```bash
npm run build    # Output in dist/
npm run preview  # Preview production build
```

## License

MIT
