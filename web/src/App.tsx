import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Login from "./Pages/Login/Login"
import SignUp from "./Pages/SignUp/SignUp"
import Homepage from './Pages/Homepage/Homepage';

function App() {
  
  return(
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<Homepage/>}/>
        <Route path="/Login" element={<Login />} />
        <Route path="/Signup" element={<SignUp/>}/>
        
      </Routes>
    </BrowserRouter>
  )
}

export default App
