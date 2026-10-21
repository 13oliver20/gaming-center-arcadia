import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const LOGO_LAYOUT_ID = 'logo_layout'
const DEFAULT_LAYOUT = { pos_x: 0, pos_y: 0, scale: 1.0 }

const DisplayLogoWidget = ({ onLoaded }) => {
    const [layout, setLayout] = useState(DEFAULT_LAYOUT)
    const [layoutLoaded, setLayoutLoaded] = useState(false)

    const fetchLayout = async () => {
        try {
            const { data, error } = await supabase
                .from('display_logo_layout')
                .select('*')
                .eq('id', LOGO_LAYOUT_ID)
                .single()
            if (!error && data) {
                setLayout({ pos_x: data.pos_x, pos_y: data.pos_y, scale: data.scale })
            }
        } catch (_) {}
        finally {
            setLayoutLoaded(true)
            if (onLoaded) onLoaded()
        }
    }

    useEffect(() => {
        fetchLayout()

        const channel = supabase
            .channel('logo-layout-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'display_logo_layout' }, (payload) => {
                if (payload.new) {
                    setLayout({ pos_x: payload.new.pos_x, pos_y: payload.new.pos_y, scale: payload.new.scale })
                }
            })
            .subscribe()

        // Polling de respaldo cada 2s
        const interval = setInterval(async () => {
            try {
                const { data, error } = await supabase
                    .from('display_logo_layout')
                    .select('*')
                    .eq('id', LOGO_LAYOUT_ID)
                    .single()
                if (!error && data) {
                    setLayout({ pos_x: data.pos_x, pos_y: data.pos_y, scale: data.scale })
                }
            } catch (_) {}
        }, 2000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(interval)
        }
    }, [])

    if (!layoutLoaded) return null

    const wrapperStyle = {
        position: 'fixed',
        left: `calc(50% + ${layout.pos_x}px)`,
        top: `calc(50% + ${layout.pos_y}px)`,
        transform: `translate(-50%, -50%) scale(${layout.scale})`,
        transformOrigin: 'center center',
        zIndex: 15,
        pointerEvents: 'none',
    }

    return (
        <div style={wrapperStyle}>
            <img
                src="/logo_arcadia.png"
                alt="Arcadia Gaming Center Logo"
                className="glow-logo"
            />
        </div>
    )
}

export default DisplayLogoWidget
