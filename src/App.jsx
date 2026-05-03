import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SystemPage from './pages/SystemPage.jsx'
import DisplayPage from './pages/DisplayPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/system" element={<SystemPage />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="/" element={<Navigate to="/system" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
