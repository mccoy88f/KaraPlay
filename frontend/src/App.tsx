import { Routes, Route, Navigate } from 'react-router-dom'
import Display from './views/Display/Display'
import Join from './views/Join/Join'
import Admin from './views/Admin/Admin'
import Stage from './views/Stage/Stage'
import Landing from './views/Landing'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/display" element={<Display />} />
      <Route path="/join" element={<Join />} />
      <Route path="/join/:joinCode" element={<Join />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/stage" element={<Stage />} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
