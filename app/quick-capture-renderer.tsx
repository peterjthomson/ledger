import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QuickCaptureApp } from './quick-capture/QuickCaptureApp'
import './quick-capture/quick-capture.css'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <QuickCaptureApp />
  </StrictMode>
)
