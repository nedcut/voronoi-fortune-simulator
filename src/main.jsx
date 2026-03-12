import React from 'react'
import ReactDOM from 'react-dom/client'
import VoronoiVisualizer from './VoronoiVisualizer.jsx'

const style = document.createElement('style')
style.textContent = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { overflow-x: hidden; transition: background 0.2s; }
`
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <VoronoiVisualizer />
  </React.StrictMode>
)
