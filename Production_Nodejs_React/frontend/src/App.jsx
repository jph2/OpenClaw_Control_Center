import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import { ChannelManagerPage } from './features/channel-manager';
import { WorkbenchPage } from './features/workbench';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/channels" element={<ChannelManagerPage />} />
        <Route path="/workbench" element={<WorkbenchPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
