import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import './AdminDashboard.css'

const DEFAULT_WANS = [
    {
        id: 'wan1',
        nombre: 'WAN 1: Movistar 500M',
        interfaz: 'ether1',
        gateway: '192.168.10.1',
        target_dns: '8.8.8.8 (Google)',
        estado: 'online',
        latencia_ms: 12,
        rx_mbps: 24.5,
        tx_mbps: 3.2,
        resolviendo: true,
        updated_at: new Date().toISOString()
    },
    {
        id: 'wan2',
        nombre: 'WAN 2: Movistar 500M',
        interfaz: 'ether2',
        gateway: '192.168.20.1',
        target_dns: '1.1.1.1 (Cloudflare)',
        estado: 'online',
        latencia_ms: 15,
        rx_mbps: 5.1,
        tx_mbps: 0.9,
        resolviendo: true,
        updated_at: new Date().toISOString()
    },
    {
        id: 'wan3',
        nombre: 'WAN 3: Movistar 500M',
        interfaz: 'ether3',
        gateway: '192.168.30.1',
        target_dns: '9.9.9.9 (Quad9)',
        estado: 'online',
        latencia_ms: 13,
        rx_mbps: 31.8,
        tx_mbps: 4.6,
        resolviendo: true,
        updated_at: new Date().toISOString()
    }
]

const QUICK_MODULES = [
    { to: '/admin/usuarios', icon: '👥', label: 'Gestión de Usuarios', desc: 'Buscador @user, Excel y puntos' },
    { to: '/admin/sorteos', icon: '🎰', label: 'Sorteos Diarios', desc: 'Horarios 1:00 PM y 5:00 PM' },
    { to: '/admin/ganadores-mensuales', icon: '🏅', label: 'Ganadores del Mes', desc: 'Top mensual acumulado' },
    { to: '/admin/qrs', icon: '📲', label: 'Gestor de QRs', desc: 'WiFi y WhatsApp del LAN' },
    { to: '/admin/anuncio', icon: '📢', label: 'Anuncios y Promos', desc: 'Banner rotativo en clientes' },
    { to: '/admin/tienda', icon: '🛒', label: 'Tienda Arcadia', desc: 'Snacks, periféricos y recargas' },
    { to: '/admin/display', icon: '🖥️', label: 'Alineación Display', desc: 'Posición de logos y texto neón' },
    { to: '/display', icon: '📺', label: 'Ver Pantalla Cliente', desc: 'Abrir /display en pantalla completa', external: true },
]

export default function AdminDashboard() {
    const [wans, setWans] = useState(DEFAULT_WANS)
    const [loading, setLoading] = useState(true)
    const [now, setNow] = useState(Date.now())
    const [lastRealtimeAt, setLastRealtimeAt] = useState(null)

    // Cargar datos iniciales desde Supabase
    const fetchStatus = async () => {
        try {
            if (!supabase) return
            const { data, error } = await supabase
                .from('mikrotik_status')
                .select('*')
                .order('id', { ascending: true })

            if (!error && data && data.length > 0) {
                setWans(data)
            }
        } catch (err) {
            console.warn('Error fetching mikrotik_status:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()

        // Suscripción Realtime en Supabase
        const channel = supabase
            .channel('mikrotik-realtime-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'mikrotik_status' }, (payload) => {
                if (payload.new) {
                    setLastRealtimeAt(Date.now())
                    setWans(prev => {
                        const idx = prev.findIndex(w => w.id === payload.new.id)
                        if (idx >= 0) {
                            const updated = [...prev]
                            updated[idx] = { ...updated[idx], ...payload.new }
                            return updated
                        }
                        return [...prev, payload.new]
                    })
                }
            })
            .subscribe()

        // Polling de respaldo cada 30 segundos (sincronizado con MikroTik y cuota Supabase)
        const poll = setInterval(fetchStatus, 30000)

        // Reloj de tiempo actual cada segundo para medir la antigüedad real de la telemetría
        const timer = setInterval(() => {
            setNow(Date.now())
        }, 1000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(poll)
            clearInterval(timer)
        }
    }, [])

    // Determinar la fecha real del último reporte enviado por MikroTik
    const latestMikrotikUpdate = useMemo(() => {
        if (lastRealtimeAt) return new Date(lastRealtimeAt)
        const dates = wans
            .map(w => w.updated_at ? new Date(w.updated_at).getTime() : 0)
            .filter(t => t > 0)
        return dates.length > 0 ? new Date(Math.max(...dates)) : null
    }, [wans, lastRealtimeAt])

    // Segundos reales transcurridos desde que MikroTik reportó
    const secondsAgo = latestMikrotikUpdate 
        ? Math.max(0, Math.floor((now - latestMikrotikUpdate.getTime()) / 1000)) 
        : null

    const isStale = secondsAgo === null || secondsAgo > 75 // Más de 75s sin telemetría nueva

    const formatTimeAgo = (sec) => {
        if (sec === null) return 'Sin datos'
        if (sec < 60) return `${sec}s`
        const mins = Math.floor(sec / 60)
        if (mins < 60) return `${mins}m ${sec % 60}s`
        const hrs = Math.floor(mins / 60)
        return `${hrs}h ${mins % 60}m`
    }

    // Cálculos globales
    const totalRx = wans.reduce((acc, w) => acc + (Number(w.rx_mbps) || 0), 0)
    const totalTx = wans.reduce((acc, w) => acc + (Number(w.tx_mbps) || 0), 0)
    const onlineCount = wans.filter(w => w.estado !== 'offline').length
    const resolvingCount = wans.filter(w => w.estado !== 'offline' && (Number(w.rx_mbps) > 0.05 || Number(w.tx_mbps) > 0.05)).length

    const getLatencyQuality = (ms, isOnline) => {
        if (!isOnline) return { label: 'Sin respuesta', color: '#ff4444' }
        if (ms === 0) return { label: '< 1 ms / En espera', color: '#888888' }
        if (ms <= 35) return { label: 'Excelente para Gaming', color: '#00ff88' }
        if (ms <= 75) return { label: 'Latencia Óptima (Internet)', color: '#00e5ff' }
        if (ms <= 110) return { label: 'Aceptable / Moderada', color: '#ffaa00' }
        return { label: 'Alta Latencia / Lag', color: '#ff4444' }
    }

    const parsePacketStats = (estado) => {
        if (typeof estado === 'string' && estado.includes('/')) {
            const parts = estado.replace(/[^0-9/]/g, '').split('/')
            const rec = parseInt(parts[0], 10) || 0
            const total = parseInt(parts[1], 10) || 30
            const loss = Math.max(0, total - rec)
            const lossPct = Math.round((loss / total) * 100)
            return { rec, total, loss, lossPct, hasData: true }
        }
        const isOff = estado === 'offline'
        return { rec: isOff ? 0 : null, total: 30, loss: 0, lossPct: 0, hasData: false }
    }

    return (
        <div className="admin-dashboard-container">
            {/* Header del NOC */}
            <div className="noc-header">
                <div className="noc-header-info">
                    <div className="noc-title-row">
                        <span className="noc-pulse-dot" style={{ background: isStale ? '#ffaa00' : '#00ff88' }} />
                        <h1 className="noc-title">MONITOREO DE RED MIKROTIK</h1>
                        <span className="noc-badge-model">MikroTik hEX · RouterOS v6.49</span>
                    </div>
                    <p className="noc-subtitle">
                        Estado y telemetría de las 3 conexiones de fibra óptica de Gaming Center Arcadia
                    </p>
                </div>

                <div className="noc-sync-info">
                    <span className="noc-sync-text" style={{ color: isStale ? '#ffaa00' : 'rgba(255,255,255,0.85)' }}>
                        {isStale ? '⚠️ Sin telemetría reciente: ' : '🟢 Telemetría en vivo: '}
                        <strong>hace {formatTimeAgo(secondsAgo)}</strong>
                        {latestMikrotikUpdate && (
                            <span style={{ opacity: 0.65, marginLeft: '4px' }}>
                                ({latestMikrotikUpdate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })})
                            </span>
                        )}
                    </span>
                    <button 
                        className="noc-btn-refresh" 
                        onClick={fetchStatus} 
                        title="Actualizar ahora"
                        disabled={loading}
                    >
                        🔄 Refrescar
                    </button>
                </div>
            </div>

            {/* Tarjetas de Resumen Global */}
            <div className="noc-global-grid">
                <div className="noc-global-card">
                    <div className="ngc-icon-wrap" style={{ color: '#00ff88', borderColor: 'rgba(0, 255, 136, 0.3)' }}>
                        ⚡
                    </div>
                    <div className="ngc-body">
                        <span className="ngc-label">LÍNEAS ACTIVAS</span>
                        <div className="ngc-val-row">
                            <span className="ngc-val" style={{ color: onlineCount === 3 ? '#00ff88' : '#ffaa00' }}>
                                {onlineCount} / {wans.length}
                            </span>
                            <span className="ngc-sub">Operativas</span>
                        </div>
                    </div>
                </div>

                <div className="noc-global-card">
                    <div className="ngc-icon-wrap" style={{ color: '#00e5ff', borderColor: 'rgba(0, 229, 255, 0.3)' }}>
                        ⬇️
                    </div>
                    <div className="ngc-body">
                        <span className="ngc-label">DESCARGA TOTAL (RX)</span>
                        <div className="ngc-val-row">
                            <span className="ngc-val" style={{ color: '#00e5ff' }}>
                                {totalRx.toFixed(1)} <small>Mbps</small>
                            </span>
                            <span className="ngc-sub">Consumo actual</span>
                        </div>
                    </div>
                </div>

                <div className="noc-global-card">
                    <div className="ngc-icon-wrap" style={{ color: '#b450ff', borderColor: 'rgba(180, 80, 255, 0.3)' }}>
                        ⬆️
                    </div>
                    <div className="ngc-body">
                        <span className="ngc-label">SUBIDA TOTAL (TX)</span>
                        <div className="ngc-val-row">
                            <span className="ngc-val" style={{ color: '#b450ff' }}>
                                {totalTx.toFixed(1)} <small>Mbps</small>
                            </span>
                            <span className="ngc-sub">Salida LAN</span>
                        </div>
                    </div>
                </div>

                <div className="noc-global-card">
                    <div className="ngc-icon-wrap" style={{ color: '#ffd600', borderColor: 'rgba(255, 214, 0, 0.3)' }}>
                        🛡️
                    </div>
                    <div className="ngc-body">
                        <span className="ngc-label">RESOLVIENDO TRÁFICO</span>
                        <div className="ngc-val-row">
                            <span className="ngc-val" style={{ color: resolvingCount === 3 ? '#00ff88' : '#ffaa00' }}>
                                {resolvingCount} de 3
                            </span>
                            <span className="ngc-sub">Enrutando paquetes</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECCIÓN DE LAS 3 LÍNEAS WAN */}
            <div className="noc-wans-section">
                <div className="noc-section-title-wrap">
                    <h2 className="noc-section-title">DETALLE POR LÍNEA WAN</h2>
                    <span className="noc-section-badge">Ancho de banda contratado: 1,500 Mbps simétricos totales</span>
                </div>

                <div className="noc-wans-grid">
                    {wans.map((wan, idx) => {
                        const pkts = parsePacketStats(wan.estado)
                        const latMs = Number(wan.latencia_ms) || 0
                        const hasLatency = latMs > 0
                        const isOffline = wan.estado === 'offline' || (pkts.hasData && pkts.rec === 0 && !hasLatency)
                        const isOnline = !isOffline
                        const rx = Number(wan.rx_mbps) || 0
                        const tx = Number(wan.tx_mbps) || 0
                        const isResolving = isOnline && (rx > 0.05 || tx > 0.05)
                        const latInfo = getLatencyQuality(latMs, isOnline || hasLatency)
                        // Porcentaje respecto a 500 Mbps contratados por línea
                        const rxPercent = Math.min(100, Math.round((rx / 500) * 100))
                        const txPercent = Math.min(100, Math.round((tx / 500) * 100))
                        const dnsTarget = wan.target_dns || (idx === 0 ? '8.8.8.8 (Google)' : idx === 1 ? '1.1.1.1 (Cloudflare)' : '9.9.9.9 (Quad9)')

                        return (
                            <div key={wan.id || idx} className={`noc-wan-card ${isOnline ? 'card-online' : 'card-offline'}`}>
                                {/* Header Tarjeta */}
                                <div className="nwc-header">
                                    <div className="nwc-title-block">
                                        <div className="nwc-linea-badge">
                                            <span className={`nwc-led ${isOnline ? 'led-green' : 'led-red'}`} />
                                            {wan.interfaz}
                                        </div>
                                        <h3 className="nwc-name">{wan.nombre}</h3>
                                        <span className="nwc-gateway">
                                            Gateway: {wan.gateway} · Ping a: <strong style={{ color: '#00e5ff' }}>{dnsTarget}</strong>
                                        </span>
                                    </div>

                                    <div className="nwc-status-badge-wrap">
                                        {isOnline ? (
                                            <span className={`nwc-status-pill ${isResolving ? 'pill-active' : 'pill-idle'}`}>
                                                {isResolving ? '🟢 RESOLVIENDO TRÁFICO' : '🟡 EN ESPERA / SIN CARGA'}
                                            </span>
                                        ) : (
                                            <span className="nwc-status-pill pill-offline">
                                                🔴 LÍNEA CAÍDA
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Métricas Principales */}
                                <div className="nwc-metrics-body">
                                    {/* Latencia MS & Paquetes */}
                                    <div className="nwc-metric-item nwc-latency-box">
                                        <div className="nwc-metric-head">
                                            <span className="nwc-m-icon">⚡</span>
                                            <span className="nwc-m-label">RESPUESTA / LATENCIA</span>
                                        </div>
                                        <div className="nwc-latency-display">
                                            <span className="nwc-latency-num" style={{ color: latInfo.color }}>
                                                {!isOnline && !hasLatency ? '--' : wan.latencia_ms}
                                            </span>
                                            <span className="nwc-latency-unit">ms</span>
                                        </div>
                                        <span className="nwc-latency-desc" style={{ color: latInfo.color }}>
                                            ● {latInfo.label}
                                        </span>
                                        <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                                            Destino: {dnsTarget}
                                        </span>
                                    </div>

                                    {/* Velocímetro Tráfico RX / TX */}
                                    <div className="nwc-traffic-bars">
                                        {/* Descarga RX */}
                                        <div className="nwc-bar-group">
                                            <div className="nwc-bar-label-row">
                                                <span className="nwc-bar-title">⬇️ Descarga (RX)</span>
                                                <span className="nwc-bar-val" style={{ color: '#00e5ff' }}>
                                                    {rx.toFixed(1)} Mbps
                                                </span>
                                            </div>
                                            <div className="nwc-bar-track">
                                                <div 
                                                    className="nwc-bar-fill fill-rx" 
                                                    style={{ width: `${Math.max(4, rxPercent)}%` }} 
                                                />
                                            </div>
                                            <span className="nwc-bar-sub">{rxPercent}% de 500M de descarga en uso</span>
                                        </div>

                                        {/* Subida TX */}
                                        <div className="nwc-bar-group">
                                            <div className="nwc-bar-label-row">
                                                <span className="nwc-bar-title">⬆️ Subida (TX)</span>
                                                <span className="nwc-bar-val" style={{ color: '#b450ff' }}>
                                                    {tx.toFixed(1)} Mbps
                                                </span>
                                            </div>
                                            <div className="nwc-bar-track">
                                                <div 
                                                    className="nwc-bar-fill fill-tx" 
                                                    style={{ width: `${Math.max(4, txPercent)}%` }} 
                                                />
                                            </div>
                                            <span className="nwc-bar-sub">{txPercent}% de 500M de subida en uso</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer de la tarjeta con Paquetes y Estado */}
                                <div className="nwc-footer">
                                    <div className="nwc-packets-info" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                        {pkts.hasData ? (
                                            <>
                                                <span className="nwc-packets-badge" style={{
                                                    background: pkts.loss === 0 ? 'rgba(0, 255, 136, 0.12)' : pkts.loss < 5 ? 'rgba(255, 214, 0, 0.12)' : 'rgba(255, 68, 68, 0.15)',
                                                    color: pkts.loss === 0 ? '#00ff88' : pkts.loss < 5 ? '#ffd600' : '#ff4444',
                                                    border: `1px solid ${pkts.loss === 0 ? 'rgba(0, 255, 136, 0.3)' : pkts.loss < 5 ? 'rgba(255, 214, 0, 0.3)' : 'rgba(255, 68, 68, 0.4)'}`,
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700
                                                }}>
                                                    📦 Paquetes: {pkts.rec}/{pkts.total} ({100 - pkts.lossPct}% entrega)
                                                </span>
                                                {pkts.loss > 0 && (
                                                    <span style={{ color: '#ffaa00', fontSize: '0.7rem' }}>
                                                        ({pkts.loss} perdidos · {pkts.lossPct}% pérdida)
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <span className="nwc-packets-badge" style={{
                                                background: 'rgba(255, 255, 255, 0.06)',
                                                color: 'rgba(255, 255, 255, 0.7)',
                                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                fontSize: '0.72rem'
                                            }}>
                                                ⏳ Esperando ciclo de 30 paquetes
                                            </span>
                                        )}
                                    </div>

                                    <span className="nwc-traffic-status">
                                        {isResolving ? (
                                            <span style={{ color: '#00ff88' }}>✓ Cursando tráfico</span>
                                        ) : (
                                            <span style={{ color: '#ffaa00' }}>⚠️ En reposo / Sin carga</span>
                                        )}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ACCESOS RÁPIDOS A MÓDULOS DEL SISTEMA */}
            <div className="noc-modules-section">
                <div className="noc-section-title-wrap">
                    <h2 className="noc-section-title">MÓDULOS DE ADMINISTRACIÓN ARCADIA</h2>
                    <span className="noc-section-badge">Acceso directo a funciones del Gaming Center</span>
                </div>

                <div className="noc-modules-grid">
                    {QUICK_MODULES.map(m => (
                        <Link 
                            key={m.to} 
                            to={m.to} 
                            className="noc-module-card"
                            target={m.external ? '_blank' : undefined}
                            rel={m.external ? 'noopener noreferrer' : undefined}
                        >
                            <span className="nmd-icon">{m.icon}</span>
                            <div className="nmd-text">
                                <h4 className="nmd-title">{m.label}</h4>
                                <p className="nmd-desc">{m.desc}</p>
                            </div>
                            <span className="nmd-arrow">→</span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}
