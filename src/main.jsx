import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Display from './pages/Display'
import './index.css'

// Lazy-loading de rutas administrativas pesadas (incluyendo xlsx de gestión de usuarios)
const Admin = lazy(() => import('./pages/Admin'))
const GestionUsuarios = lazy(() => import('./pages/admin/GestionUsuarios'))
const GestorQRs = lazy(() => import('./pages/admin/GestorQRs'))
const GestorSorteos = lazy(() => import('./pages/admin/GestorSorteos'))
const GestorGanadoresMensuales = lazy(() => import('./pages/admin/GestorGanadoresMensuales'))
const GestorAnuncios = lazy(() => import('./pages/admin/GestorAnuncios'))
const GestorBeneficios = lazy(() => import('./pages/admin/GestorBeneficios'))
const GestorTienda = lazy(() => import('./pages/admin/GestorTienda'))
const GestorDisplayAdmin = lazy(() => import('./pages/admin/GestorDisplayAdmin'))

// Script para cambiar automáticamente el favicon blanco a negro usando Canvas HTML5
const setBlackFavicon = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const img = new Image();
  img.src = '/favicon.png';
  img.onload = () => {
    // Dibujar la original
    ctx.drawImage(img, 0, 0, 64, 64);

    // Cambiar los píxeles blancos a negros
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 64, 64);

    // Reemplazar el Tag <link rel="icon">
    const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
    link.type = 'image/png';
    link.rel = 'icon';
    link.href = canvas.toDataURL('image/png');
    document.getElementsByTagName('head')[0].appendChild(link);
  };
};

// Invocar Inmediatamente
setBlackFavicon();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#05050f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00e5ff' }}>Cargando...</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/display" replace />} />
          <Route path="/display" element={<Display />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/usuarios" element={<Admin><GestionUsuarios /></Admin>} />
          <Route path="/admin/qrs" element={<Admin><GestorQRs /></Admin>} />
          <Route path="/admin/sorteos" element={<Admin><GestorSorteos /></Admin>} />
          <Route path="/admin/ganadores-mensuales" element={<Admin><GestorGanadoresMensuales /></Admin>} />
          <Route path="/admin/anuncio" element={<Admin><GestorAnuncios /></Admin>} />
          <Route path="/admin/beneficios" element={<Admin><GestorBeneficios /></Admin>} />
          <Route path="/admin/tienda" element={<Admin><GestorTienda /></Admin>} />
          <Route path="/admin/display" element={<Admin><GestorDisplayAdmin /></Admin>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
)
