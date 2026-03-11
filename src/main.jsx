import React from 'react'
import ReactDOM from 'react-dom/client'
import VoronoiVisualizer from './VoronoiVisualizer.jsx'

const style = document.createElement('style')
style.textContent = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #080d19; overflow-x: hidden; }
`
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <VoronoiVisualizer />
  </React.StrictMode>
)
