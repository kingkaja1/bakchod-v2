import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(err) { return { error: err } }
  componentDidCatch(err, info) { console.error('App error:', err, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', background: '#111', color: '#fff', minHeight: '100vh' }}>
          <h2 style={{ color: '#ff0040' }}>Something went wrong</h2>
          <pre style={{ background: '#222', padding: 16, overflow: 'auto', fontSize: 12 }}>{this.state.error?.message || String(this.state.error)}</pre>
          <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>Check the browser Console (F12) for details.</p>
          {!import.meta.env.VITE_FIREBASE_API_KEY && (
            <p style={{ marginTop: 16, color: '#f80' }}>Tip: Copy .env.example to .env and add your Firebase config.</p>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
