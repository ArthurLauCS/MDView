import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/markdown.css'
import './App.css'

const el = document.getElementById('root')
if (!el) throw new Error('#root missing from index.html')

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
