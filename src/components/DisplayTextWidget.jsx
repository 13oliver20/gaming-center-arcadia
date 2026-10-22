import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const TEXT_LAYOUT_ID = 'text_layout'
const DEFAULT_LAYOUT = { pos_x: 0, pos_y: 0, scale: 1.0, texto: 'GAMING CENTER ARCADIA', efecto: 'rgb-flow' }

const DisplayTextWidget = ({ onLoaded }) => {
    const [layout, setLayout] = useState(DEFAULT_LAYOUT)
    const [layoutLoaded, setLayoutLoaded] = useState(false)

    const applyLayout = (data) => {
        setLayout({
            pos_x:  data.pos_x,
            pos_y:  data.pos_y,
            scale:  data.scale,
            texto:  data.texto  || DEFAULT_LAYOUT.texto,
            efecto: data.efecto || DEFAULT_LAYOUT.efecto,
        })
    }

    const fetchLayout = async () => {
        try {
            const { data, error } = await supabase
                .from('display_text_layout')
                .select('*')
                .eq('id', TEXT_LAYOUT_ID)
                .single()
            if (!error && data) applyLayout(data)
        } catch (_) {}
        finally {
            setLayoutLoaded(true)
            if (onLoaded) onLoaded()
        }
    }

    useEffect(() => {
        fetchLayout()

        const channel = supabase
            .channel('text-layout-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'display_text_layout' }, (payload) => {
                if (payload.new) applyLayout(payload.new)
            })
            .subscribe()

        // Polling de respaldo cada 2s
        const interval = setInterval(async () => {
            try {
                const { data, error } = await supabase
                    .from('display_text_layout')
                    .select('*')
                    .eq('id', TEXT_LAYOUT_ID)
                    .single()
                if (!error && data) applyLayout(data)
            } catch (_) {}
        }, 2000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [])

    const wrapperStyle = {
        position: 'fixed',
        left: `calc(50% + ${layout.pos_x}px)`,
        top: `calc(50% + ${layout.pos_y}px)`,
        transform: `translate(-50%, -50%) scale(${layout.scale})`,
        transformOrigin: 'center center',
        zIndex: 10,
        pointerEvents: 'none',
    }

    const effectClass = `text-effect-${layout.efecto}`

    return (
        <div style={wrapperStyle}>
            <div className="glow-text-container" style={{ display: 'grid', width: '100vw' }}>
                {/* Glow Layer (Behind) */}
                <h1
                    className={`glow-text-layer ${effectClass} glow-blur`}
                    style={{ textAlign: 'center', whiteSpace: 'pre-wrap', gridArea: '1 / 1' }}
                    data-text={layout.texto}
                >
                    {layout.texto}
                </h1>

                {/* Main Text Layer (Front) */}
                <h1
                    className={`glow-text-layer ${effectClass} glow-front`}
                    style={{ textAlign: 'center', whiteSpace: 'pre-wrap', gridArea: '1 / 1' }}
                    data-text={layout.texto}
                >
                    {layout.texto}
                </h1>
            </div>
        </div>
    )
}

export default DisplayTextWidget
