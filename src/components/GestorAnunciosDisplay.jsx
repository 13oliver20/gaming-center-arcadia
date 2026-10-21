import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../supabaseClient'
import './GestorAnunciosDisplay.css'


const DEFAULT_STYLE = {
    font: 'Inter, sans-serif',
    size: 1.0,
    icon: '📢',
    color: '#ffffff',
    pos_x: 0,
    pos_y: 0,
}

// ─── Lightbox ────────────────────────────────────────────────────────────────
const Lightbox = ({ imagenes, startIndex = 0, onClose }) => {
    const [current, setCurrent] = useState(startIndex)
    const imgs = imagenes.slice().sort((a, b) => a.orden - b.orden)

    const prev = useCallback(() => setCurrent(i => (i - 1 + imgs.length) % imgs.length), [imgs.length])
    const next = useCallback(() => setCurrent(i => (i + 1) % imgs.length), [imgs.length])

    // Keyboard navigation
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'ArrowLeft')  prev()
            if (e.key === 'ArrowRight') next()
            if (e.key === 'Escape')     onClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [prev, next, onClose])

    if (imgs.length === 0) return null

    const img = imgs[current]

    const content = (
        /* Overlay — click fuera cierra */
        <div className="lb-overlay" onClick={onClose} role="dialog" aria-modal="true">

            {/* Contenedor principal — detiene la propagación */}
            <div className="lb-container" onClick={e => e.stopPropagation()}>

                {/* ── Barra superior: contador izq | X der ── */}
                <div className="lb-topbar">
                    {imgs.length > 1
                        ? <span className="lb-counter">{current + 1} / {imgs.length}</span>
                        : <span />
                    }
                    <button className="lb-close" onClick={onClose} aria-label="Cerrar">✕</button>
                </div>

                {/* ── Fila de navegación: ‹ | imagen | › ── */}
                <div className="lb-nav-row">
                    {imgs.length > 1 ? (
                        <button
                            className="lb-arrow lb-arrow--prev"
                            onClick={e => { e.stopPropagation(); prev() }}
                            aria-label="Imagen anterior"
                        >‹</button>
                    ) : <div className="lb-arrow-placeholder" />}

                    <div className="lb-frame">
                        <img
                            key={img.url}
                            src={img.url}
                            alt={img.name || `Imagen ${current + 1}`}
                            className="lb-img"
                            draggable={false}
                            onError={e => {
                                e.currentTarget.onerror = null
                                e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%230a0e20"/><text x="200" y="160" text-anchor="middle" fill="%23444" font-size="48">🖼</text></svg>'
                            }}
                        />
                        {img.name && (
                            <div className="lb-caption">{img.name}</div>
                        )}
                    </div>

                    {imgs.length > 1 ? (
                        <button
                            className="lb-arrow lb-arrow--next"
                            onClick={e => { e.stopPropagation(); next() }}
                            aria-label="Imagen siguiente"
                        >›</button>
                    ) : <div className="lb-arrow-placeholder" />}
                </div>

                {/* ── Puntos de navegación ── */}
                {imgs.length > 1 && (
                    <div className="lb-dots">
                        {imgs.map((_, i) => (
                            <button
                                key={i}
                                className={`lb-dot ${i === current ? 'lb-dot--active' : ''}`}
                                onClick={() => setCurrent(i)}
                                aria-label={`Ir a imagen ${i + 1}`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )

    // Portal: renderiza en document.body para evitar interferencias de padres
    return createPortal(content, document.body)
}


// ─── Componente principal ────────────────────────────────────────────────────
const GestorAnunciosDisplay = () => {
    const [anuncios, setAnuncios] = useState([])
    const [lightbox, setLightbox] = useState(null) // { imagenes }

    const fetchAnuncios = async () => {
        const { data, error } = await supabase
            .from('anuncios')
            .select('id, texto, font, size, icon, color, pos_x, pos_y, activo, interactivo, imagenes')
            .order('updated_at', { ascending: true })

        if (!error && data) {
            setAnuncios(
                data
                    .filter(a => a.texto?.trim() && a.activo !== false)
                    .map(a => ({
                        ...a,
                        imagenes: Array.isArray(a.imagenes) ? a.imagenes : [],
                    }))
            )
        }
    }

    useEffect(() => { fetchAnuncios() }, [])

    useEffect(() => {
        const channel = supabase
            .channel('anuncios-broadcast')
            .on('broadcast', { event: 'anuncios_update' }, () => fetchAnuncios())
            .subscribe()

        const poll = setInterval(fetchAnuncios, 30000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(poll)
        }
    }, [])

    const handleAnuncioClick = (a) => {
        if (!a.interactivo || a.imagenes.length === 0) return
        setLightbox({ imagenes: a.imagenes })
    }

    if (anuncios.length === 0) return null

    return (
        <>
            {anuncios.map((a) => {
                const font  = a.font  ?? DEFAULT_STYLE.font
                const size  = parseFloat(a.size  ?? DEFAULT_STYLE.size)
                const icon  = a.icon  ?? DEFAULT_STYLE.icon
                const color = a.color ?? DEFAULT_STYLE.color
                const posX  = parseInt(a.pos_x ?? DEFAULT_STYLE.pos_x)
                const posY  = parseInt(a.pos_y ?? DEFAULT_STYLE.pos_y)
                const isInteractive = a.interactivo && a.imagenes.length > 0

                return (
                    <div
                        key={a.id}
                        className="anuncios-display-wrapper"
                        style={{ transform: `translate(${posX}px, ${posY}px)` }}
                    >
                        <div
                            className={`anuncios-display-bar ${isInteractive ? 'anuncios-display-bar--interactive' : ''}`}
                            style={{
                                fontFamily: font,
                                color: color,
                                fontSize: `${size * 1.1}rem`,
                                textShadow: `0 0 20px ${color}55, 0 0 40px ${color}22`,
                                borderColor: `${color}30`,
                                boxShadow: isInteractive
                                    ? `0 0 0 1px ${color}10, 0 0 0 2px rgba(180,80,255,0.25), 0 4px 30px rgba(0,0,0,0.5), inset 0 0 24px rgba(0,0,0,0.2)`
                                    : `0 0 0 1px ${color}10, 0 4px 30px rgba(0,0,0,0.5), inset 0 0 24px rgba(0,0,0,0.2)`,
                                cursor: isInteractive ? 'pointer' : 'default',
                            }}
                            onClick={() => handleAnuncioClick(a)}
                            title={isInteractive ? 'Haz clic para ver imágenes' : undefined}
                        >
                            <span
                                className="anuncios-display-icon"
                                style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
                            >
                                {icon}
                            </span>
                            <div className="anuncios-display-scroll-area">
                                <p className="anuncios-display-text">{a.texto}</p>
                            </div>
                            {/* Indicador visual de interactivo */}
                            {isInteractive && (
                                <span className="anuncios-display-interactive-badge">
                                    🎞️
                                </span>
                            )}
                        </div>
                    </div>
                )
            })}

            {/* Lightbox */}
            {lightbox && (
                <Lightbox
                    imagenes={lightbox.imagenes}
                    startIndex={0}
                    onClose={() => setLightbox(null)}
                />
            )}
        </>
    )
}

export default GestorAnunciosDisplay
