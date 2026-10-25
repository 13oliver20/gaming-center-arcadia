import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './GestorQRsDisplay.css'

const LAYOUT_ID = 'qr_layout'
const DEFAULT_LAYOUT = { pos_x: 30, pos_y: 10, scale: 1.1 }

const getInitialLayout = () => {
    try {
        const cached = localStorage.getItem('arcadia_qr_layout')
        if (cached) return JSON.parse(cached)
    } catch (_) {}
    return DEFAULT_LAYOUT
}

const GestorQRsDisplay = ({ onLoaded }) => {
    const [config, setConfig] = useState({ wifi: null, whatsapp: null })
    const [activeTab, setActiveTab] = useState('whatsapp')
    const [loading, setLoading] = useState(true)
    const [layout, setLayout] = useState(getInitialLayout)

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [qrRes, lRes] = await Promise.all([
                    supabase.from('configuracion_qrs').select('*'),
                    supabase.from('display_qr_layout').select('*').eq('id', LAYOUT_ID).single()
                ])

                if (qrRes.data) {
                    const wifi = qrRes.data.find(d => d.tipo === 'wifi')
                    const wa = qrRes.data.find(d => d.tipo === 'whatsapp')
                    const isActiveGlobal = (wifi?.isactive !== false) && (wa?.isactive !== false)
                    if (!isActiveGlobal) {
                        setConfig(null)
                    } else {
                        setConfig({ wifi, whatsapp: wa })
                    }
                }

                if (lRes.data) {
                    const safeY = (lRes.data.pos_y > 500 || lRes.data.pos_y < -500) ? 0 : lRes.data.pos_y
                    const next = { pos_x: lRes.data.pos_x, pos_y: safeY, scale: lRes.data.scale }
                    setLayout(next)
                    try { localStorage.setItem('arcadia_qr_layout', JSON.stringify(next)) } catch (_) {}
                }
            } catch (err) {
                console.error('Error fetching QR config for display:', err)
            } finally {
                setLoading(false)
                if (onLoaded) onLoaded()
            }
        }

        fetchAll()

        const channel = supabase
            .channel('qr-display-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracion_qrs' }, () => {
                fetchAll()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'display_qr_layout' }, (payload) => {
                if (payload.new) {
                    setLayout({
                        pos_x: payload.new.pos_x,
                        pos_y: payload.new.pos_y,
                        scale: payload.new.scale,
                    })
                }
            })
            .subscribe()

        // Polling de respaldo cada 5 minutos (o al recuperar foco) para ahorro de cuota Supabase
        const refreshSafe = async () => {
            try {
                fetchAll()
                const { data, error } = await supabase
                    .from('display_qr_layout')
                    .select('*')
                    .eq('id', LAYOUT_ID)
                    .single()
                if (!error && data) {
                    const safeY = (data.pos_y > 500 || data.pos_y < -500) ? 0 : data.pos_y
                    setLayout({ pos_x: data.pos_x, pos_y: safeY, scale: data.scale })
                }
            } catch (_) {}
        }

        const layoutInterval = setInterval(refreshSafe, 5 * 60 * 1000)
        window.addEventListener('focus', refreshSafe)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(layoutInterval)
            window.removeEventListener('focus', refreshSafe)
        }
    }, [])

    if (loading || !config) return null

    const currentData = activeTab === 'whatsapp' ? config.whatsapp : config.wifi

    const widgetStyle = {
        left: `${layout.pos_x}px`,
        top: `calc(50% + ${layout.pos_y}px)`,
        transform: `translateY(-50%) scale(${layout.scale})`,
        transformOrigin: 'top left',
    }

    return (
        <div className="qr-display-widget" style={widgetStyle}>
            <div className="qr-tabs">
                <button
                    className={`qr-tab ${activeTab === 'whatsapp' ? 'active whatsapp' : ''}`}
                    onClick={() => setActiveTab('whatsapp')}
                >
                    <span className="qr-tab-icon">💬</span> WHATSAPP
                </button>
                <button
                    className={`qr-tab ${activeTab === 'wifi' ? 'active wifi' : ''}`}
                    onClick={() => setActiveTab('wifi')}
                >
                    <span className="qr-tab-icon">📶</span> WIFI
                </button>
            </div>

            <div className="qr-content-area">
                <div className="qr-image-wrapper">
                    {currentData?.imagen_url ? (
                        <img src={currentData.imagen_url} alt={`${activeTab} QR`} className="qr-img" />
                    ) : (
                        <div className="qr-placeholder">No QR Set</div>
                    )}
                </div>

                <div className="qr-text-info">
                    {activeTab === 'whatsapp' ? (
                        <>
                            <h3>Comunidad oficial</h3>
                            <p>{currentData?.campo_1 || 'Únete a nuestro grupo oficial.'}</p>
                        </>
                    ) : (
                        <>
                            <h3>Conéctate al WiFi</h3>
                            <p><strong>SSID:</strong> {currentData?.campo_1 || 'Not Set'}</p>
                            <p><strong>Clave:</strong> {currentData?.campo_2 || 'Not Set'}</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

export default GestorQRsDisplay
