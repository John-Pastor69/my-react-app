import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

import Login from './pages/Login';

export default function App() {
  return (
    <main>
      <h1>STI Facility Reservation</h1>
      <Login /> 
    </main>
  );
}