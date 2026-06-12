import { Navigate, Route, Routes } from "react-router-dom";
import { Display } from "./views/Display";
import { Join } from "./views/Join";
import { JoinHome } from "./views/JoinHome";
import { Admin } from "./views/Admin";
import { TestMidi } from "./views/TestMidi";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/join" replace />} />
      <Route path="/join" element={<JoinHome />} />
      <Route path="/join/enter" element={<Join />} />
      <Route path="/display" element={<Display />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/test-midi" element={<TestMidi />} />
      <Route path="*" element={<Navigate to="/join" replace />} />
    </Routes>
  );
}

export default App;
