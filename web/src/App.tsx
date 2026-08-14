import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';

import Login from "./Pages/Login/Login";
import SignUp from "./Pages/SignUp/SignUp";
import Homepage from './Pages/Homepage/Homepage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path='/' element={<Homepage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="*" element={<p style={{ padding: 24 }}>Page not found</p>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;