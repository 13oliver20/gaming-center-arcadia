import React, { useEffect, useRef, useState } from 'react'
import GestorQRsDisplay from '../components/GestorQRsDisplay'
import GestorSorteosDisplay from '../components/GestorSorteosDisplay'
import GestorAnunciosDisplay from '../components/GestorAnunciosDisplay'
import TiendaModal from '../components/TiendaModal'
import DisplayLogoWidget from '../components/DisplayLogoWidget'
import DisplayTextWidget from '../components/DisplayTextWidget'
import { supabase } from '../supabaseClient'
import './Display.css'

const STAR_COUNT = 180
const REPEL_RADIUS = 110
const REPEL_FORCE = 0.38

const Display = () => {
    const canvasRef = useRef(null)
    const mouse = useRef({ x: null, y: null, nx: 0, ny: 0 })
    const animRef = useRef(null)

    // Estado del Tiempo y Tienda
    const [time, setTime] = useState(new Date())
    const [isTiendaOpen, setIsTiendaOpen] = useState(false)
    const [tiendaVisible, setTiendaVisible] = useState(true)

    // Cargar visibilidad de tienda y suscribirse en tiempo real
    useEffect(() => {
        if (!supabase) return

        const fetchTiendaVisibility = async () => {
            const { data } = await supabase
                .from('display_config')
                .select('value')
                .eq('key', 'tienda_visible')
                .single()
            if (data != null) setTiendaVisible(data.value)
        }
        fetchTiendaVisibility()

        // Broadcast: actualización instantánea cuando el admin cambia el toggle
        const channel = supabase
            .channel('tienda-display-broadcast')
            .on('broadcast', { event: 'tienda_visibility_update' }, (msg) => {
                if (msg.payload != null && typeof msg.payload.value === 'boolean') {
                    setTiendaVisible(msg.payload.value)
                } else {
                    fetchTiendaVisibility()
                }
            })
            .subscribe()

        // Polling de respaldo cada 3s (por si broadcast no llega)
        const poll = setInterval(fetchTiendaVisibility, 3000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(poll)
        }
    }, [])

    useEffect(() => {
        // Reloj
        const timer = setInterval(() => {
            setTime(new Date())
        }, 1000)

        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')

        let width = (canvas.width = window.innerWidth)
        let height = (canvas.height = window.innerHeight)

        // Stars
        const stars = Array.from({ length: STAR_COUNT }, () => ({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: 0,
            vy: 0,
            // Reference: mostly tiny dots (0.4-1px), very few slightly bigger (up to 1.5px)
            size: Math.random() < 0.85
                ? Math.random() * 0.7 + 0.3   // 85% tiny: 0.3–1.0px
                : Math.random() * 0.5 + 1.0,  // 15% medium: 1.0–1.5px
            driftX: (Math.random() - 0.5) * 0.12,
            driftY: (Math.random() - 0.5) * 0.12,
        }))

        let tick = 0

        const handleMouseMove = (e) => {
            mouse.current = { x: e.clientX, y: e.clientY, nx: 0, ny: 0 }
        }
        const handleMouseLeave = () => {
            mouse.current = { x: null, y: null, nx: 0, ny: 0 }
        }
        const handleResize = () => {
            width = canvas.width = window.innerWidth
            height = canvas.height = window.innerHeight
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseleave', handleMouseLeave)
        window.addEventListener('resize', handleResize)

        const draw = () => {
            ctx.fillStyle = '#05050f'
            ctx.fillRect(0, 0, width, height)
            tick++

            const mx = mouse.current.x
            const my = mouse.current.y

            for (const s of stars) {
                // Mouse repel
                if (mx !== null && my !== null) {
                    const dx = s.x - mx
                    const dy = s.y - my
                    const dist = Math.sqrt(dx * dx + dy * dy)
                    if (dist < REPEL_RADIUS && dist > 0) {
                        const force = ((REPEL_RADIUS - dist) / REPEL_RADIUS) * REPEL_FORCE
                        s.vx += (dx / dist) * force
                        s.vy += (dy / dist) * force
                    }
                }

                // Damping — return to drift
                s.vx = (s.vx + s.driftX * 0.05) * 0.95
                s.vy = (s.vy + s.driftY * 0.05) * 0.95

                s.x += s.vx + s.driftX
                s.y += s.vy + s.driftY

                // Wrap edges
                if (s.x < -5) s.x = width + 5
                if (s.x > width + 5) s.x = -5
                if (s.y < -5) s.y = height + 5
                if (s.y > height + 5) s.y = -5

                // Pure white — fully bright
                ctx.beginPath()
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
                ctx.fillStyle = 'rgba(255, 255, 255, 1)'

                // Glow — subtle, only on medium+ stars
                if (s.size > 0.9) {
                    ctx.shadowBlur = s.size * 3
                    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)'
                }

                ctx.fill()
                ctx.shadowBlur = 0
            }

            animRef.current = requestAnimationFrame(draw)
        }

        animRef.current = requestAnimationFrame(draw)

        return () => {
            clearInterval(timer) // Limpiar reloj
            cancelAnimationFrame(animRef.current)
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseleave', handleMouseLeave)
            window.removeEventListener('resize', handleResize)
        }
    }, [])

    // Formateo de Fecha y Hora (GMT-5 Lima, Perú)
    const dateFormatted = time.toLocaleDateString('es-PE', {
        timeZone: 'America/Lima',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    })

    const timeFormatted = time.toLocaleTimeString('en-US', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    })

    return (
        <div className="display-page">
            {/* Reloj y Fecha (Esquinas Superiores) */}
            <div className="display-top-left-date">
                {dateFormatted}
            </div>
            <div className="display-top-right-time">
                {timeFormatted}
            </div>

            <GestorQRsDisplay onLoaded={() => setQrLoaded(true)} />
            <GestorSorteosDisplay onLoaded={() => setSorteosLoaded(true)} />

            {/* GAMING CENTER ARCADIA - GLOW TEXT EFFECT */}
            <div className="glow-container-wrapper">
                <DisplayLogoWidget onLoaded={() => setLogoLoaded(true)} />

                <DisplayTextWidget onLoaded={() => setTextLoaded(true)} />

                {/* Announcements below the title - inside a 0-height container so they don't push the logo up */}
                <div style={{ position: 'relative', width: '100%', height: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <GestorAnunciosDisplay />
                </div>
            </div>

            {/* ---- TIENDA icon — bottom-left corner ---- */}
            {tiendaVisible && <div className="tienda-btn" onClick={() => setIsTiendaOpen(true)}>
                <div className="tienda-icon-wrap">
                    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="tienda-svg">
                        {/* controller body */}
                        <rect x="4" y="16" width="40" height="22" rx="11" fill="url(#tg)" />
                        {/* d-pad */}
                        <rect x="11" y="23" width="3" height="9" rx="1.5" fill="#fff" opacity="0.9" />
                        <rect x="8" y="26" width="9" height="3" rx="1.5" fill="#fff" opacity="0.9" />
                        {/* buttons */}
                        <circle cx="33" cy="24" r="2" fill="#ff4eb8" />
                        <circle cx="37" cy="27.5" r="2" fill="#00e5ff" />
                        <circle cx="33" cy="31" r="2" fill="#00e676" />
                        <circle cx="29" cy="27.5" r="2" fill="#ffd600" />
                        {/* handles detail lines */}
                        <ellipse cx="12" cy="34" rx="5" ry="3" fill="rgba(0,0,0,0.18)" />
                        <ellipse cx="36" cy="34" rx="5" ry="3" fill="rgba(0,0,0,0.18)" />
                        {/* cart bag on top */}
                        <path d="M19 16 Q24 8 29 16" stroke="url(#ts)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                        <defs>
                            <linearGradient id="tg" x1="4" y1="16" x2="44" y2="38" gradientUnits="userSpaceOnUse">
                                <stop offset="0%" stopColor="#1a0533" />
                                <stop offset="100%" stopColor="#0a0f2e" />
                            </linearGradient>
                            <linearGradient id="ts" x1="19" y1="12" x2="29" y2="16" gradientUnits="userSpaceOnUse">
                                <stop offset="0%" stopColor="#ff4eb8" />
                                <stop offset="100%" stopColor="#00e5ff" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div className="tienda-glow-ring" />
                </div>
                <span className="tienda-label">Tienda</span>
            </div>}

            <canvas ref={canvasRef} className="particle-canvas" />

            {/* Logo Inferior Pequeño */}
            <div className="display-footer-logo">
                <img src="/arcadia_gaming.png" alt="Arcadia Gaming" />
            </div>

            {/* Modal de la tienda */}
            <TiendaModal isOpen={isTiendaOpen} onClose={() => setIsTiendaOpen(false)} />
        </div>
    )
}

export default Display
