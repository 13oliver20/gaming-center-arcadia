import React, { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import './AdminDashboard.css'

// Interfaces WAN fijas de Gaming Center Arcadia
const DEFAULT_WANS = [
    {
        id: 'wan1',
        nombre: 'WAN 1: Movistar 500M',
        interfaz: 'ether1',
        gateway: '192.168.10.1',
        target_dns: '200.48.225.146 (DNS Movistar)',
        estado: 'online',
        latencia_ms: 13,
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
        target_dns: '200.48.225.146 (DNS Movistar)',
        estado: 'online',
        latencia_ms: 14,
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
        target_dns: '200.48.225.146 (DNS Movistar)',
        estado: 'online',
        latencia_ms: 6,
        rx_mbps: 31.8,
        tx_mbps: 4.6,
        resolviendo: true,
        updated_at: new Date().toISOString()
    }
]

// Estado inicial de salud del MikroTik
const DEFAULT_HEALTH = {
    id: 'system',
    cpu_load: 14,
    free_memory_mb: 214,
    total_memory_mb: 256,
    memory_pct: 16,
    uptime: '1d 06:15:00',
    cpu_frequency: 880,
    board_name: 'hEX (RB750Gr3)',
    version: 'RouterOS v6.49',
    updated_at: new Date().toISOString()
}

// Generador de 40 PCs por defecto (192.168.1.101 al 192.168.1.140)
const GENERATE_DEFAULT_CLIENTS = () => {
    return Array.from({ length: 40 }, (_, idx) => {
        const num = idx + 1
        const ip = `192.168.1.${100 + num}`
        // Semillero realista inicial para ver el mapa de piso mientras el MikroTik sincroniza
        const isOnline = num <= 24 // 24 encendidas
        const isGaming = isOnline && (num % 2 === 1) // Impares en juego
        const isHeavy = num === 7 // PC-07 descargando fuerte
        return {
            ip,
            pc_name: `PC-${String(num).padStart(2, '0')}`,
            pc_number: num,
            online: isOnline,
            rx_kbps: isHeavy ? 48500 : isGaming ? Math.floor(Math.random() * 4000 + 1500) : isOnline ? Math.floor(Math.random() * 8000 + 800) : 0,
            tx_kbps: isGaming ? Math.floor(Math.random() * 1200 + 400) : isOnline ? Math.floor(Math.random() * 500 + 100) : 0,
            wan_active: !isOnline ? 'idle' : isGaming ? 'wan3_gaming' : (num % 4 === 0 ? 'wan2_nav' : 'wan1_nav'),
            actividad: !isOnline ? 'apagada' : isHeavy ? 'descarga' : isGaming ? 'gaming' : 'navegacion',
            updated_at: new Date().toISOString()
        }
    })
}

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
    const [health, setHealth] = useState(DEFAULT_HEALTH)
    const [clients, setClients] = useState(GENERATE_DEFAULT_CLIENTS)
    const [clientFilter, setClientFilter] = useState('all') // 'all', 'gaming', 'nav', 'heavy', 'offline'
    const [floorOrientation, setFloorOrientation] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.innerWidth >= 1024 ? 'horizontal' : 'vertical'
        }
        return 'horizontal'
    })
    const [selectedPc, setSelectedPc] = useState(null)
    const [loading, setLoading] = useState(true)
    const [now, setNow] = useState(Date.now())
    const [lastRealtimeAt, setLastRealtimeAt] = useState(null)

    // Cargar datos iniciales desde Supabase
    const fetchStatus = async () => {
        try {
            if (!supabase) return
            
            // 1. Cargar WANs
            const { data: wanData } = await supabase
                .from('mikrotik_status')
                .select('*')
                .order('id', { ascending: true })
            if (wanData && wanData.length > 0) setWans(wanData)

            // 2. Cargar Salud del MikroTik
            const { data: healthData } = await supabase
                .from('mikrotik_health')
                .select('*')
                .eq('id', 'system')
                .single()
            if (healthData) setHealth(healthData)

            // 3. Cargar las 40 PCs clientes
            const { data: clientData } = await supabase
                .from('mikrotik_clients')
                .select('*')
                .order('pc_number', { ascending: true })
            if (clientData && clientData.length > 0) {
                setClients(prev => {
                    const merged = [...prev]
                    clientData.forEach(c => {
                        const idx = merged.findIndex(p => p.ip === c.ip || p.pc_number === c.pc_number)
                        if (idx >= 0) merged[idx] = { ...merged[idx], ...c }
                    })
                    return merged
                })
            }
        } catch (err) {
            console.warn('Error fetching telemetry:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()

        // 1. Suscripción Realtime para WANs
        const chWans = supabase
            .channel('mikrotik-realtime-wans')
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

        // 2. Suscripción Realtime para Salud del Router
        const chHealth = supabase
            .channel('mikrotik-realtime-health')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'mikrotik_health' }, (payload) => {
                if (payload.new) {
                    setHealth(payload.new)
                }
            })
            .subscribe()

        // 3. Suscripción Realtime para las 40 PCs Clientes
        const chClients = supabase
            .channel('mikrotik-realtime-clients')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'mikrotik_clients' }, (payload) => {
                if (payload.new) {
                    setClients(prev => {
                        const idx = prev.findIndex(c => c.ip === payload.new.ip || c.pc_number === payload.new.pc_number)
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

        // Polling de respaldo cada 30 segundos
        const poll = setInterval(fetchStatus, 30000)

        // Reloj cada segundo para medir la antigüedad real de la telemetría
        const timer = setInterval(() => {
            setNow(Date.now())
        }, 1000)

        return () => {
            supabase.removeChannel(chWans)
            supabase.removeChannel(chHealth)
            supabase.removeChannel(chClients)
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

    const secondsAgo = latestMikrotikUpdate 
        ? Math.max(0, Math.floor((now - latestMikrotikUpdate.getTime()) / 1000)) 
        : null

    const isStale = secondsAgo === null || secondsAgo > 75

    const formatTimeAgo = (sec) => {
        if (sec === null) return 'Sin datos'
        if (sec < 60) return `${sec}s`
        const mins = Math.floor(sec / 60)
        if (mins < 60) return `${mins}m ${sec % 60}s`
        const hrs = Math.floor(mins / 60)
        return `${hrs}h ${mins % 60}m`
    }

    // Cálculos globales WANs
    const totalRx = wans.reduce((acc, w) => acc + (Number(w.rx_mbps) || 0), 0)
    const totalTx = wans.reduce((acc, w) => acc + (Number(w.tx_mbps) || 0), 0)
    const isWanAlive = (w) => {
        if (!w || w.estado === 'offline') return false
        if (typeof w.estado === 'string' && w.estado.includes('/')) {
            const parts = w.estado.replace(/[^0-9/]/g, '').split('/')
            const rec = parseInt(parts[0], 10) || 0
            if (rec === 0) return false
        }
        return true
    }
    const onlineCount = wans.filter(isWanAlive).length
    const resolvingCount = wans.filter(w => isWanAlive(w) && (Number(w.rx_mbps) > 0.05 || Number(w.tx_mbps) > 0.05)).length

    // Cálculos de clientes (40 PCs)
    const onlineClients = clients.filter(c => c.online)
    const gamingClients = clients.filter(c => c.online && (c.wan_active === 'wan3_gaming' || c.actividad === 'gaming'))
    const navClients = clients.filter(c => c.online && (c.wan_active === 'wan1_nav' || c.wan_active === 'wan2_nav' || c.actividad === 'navegacion'))
    const heavyClients = clients.filter(c => c.online && (Number(c.rx_kbps) > 25000 || c.actividad === 'descarga'))
    const offlineClients = clients.filter(c => !c.online)

    // Top consumidor de ancho de banda
    const topConsumer = useMemo(() => {
        const sorted = [...clients].filter(c => c.online).sort((a, b) => (Number(b.rx_kbps) || 0) - (Number(a.rx_kbps) || 0))
        if (sorted.length > 0 && Number(sorted[0].rx_kbps) > 5000) return sorted[0]
        return null
    }, [clients])

    // Lista de PCs filtrada
    const filteredClients = useMemo(() => {
        if (clientFilter === 'gaming') return gamingClients
        if (clientFilter === 'nav') return navClients
        if (clientFilter === 'heavy') return heavyClients
        if (clientFilter === 'offline') return offlineClients
        return clients
    }, [clients, clientFilter, gamingClients, navClients, heavyClients, offlineClients])

    // Formateador exacto en Kilobytes (KB) solicitado por el usuario
    const formatKB = (val) => {
        const num = Math.round(Number(val) || 0)
        return `${num.toLocaleString()} KB`
    }

    // Obtener PC por número fijo de puesto (1 al 40) para mantener la distribución física
    const getPcByNumber = (num) => {
        const found = clients.find(c => c.pc_number === num)
        if (found) return found
        return {
            ip: `192.168.1.${100 + num}`,
            pc_name: `PC-${String(num).padStart(2, '0')}`,
            pc_number: num,
            online: false,
            rx_kbps: 0,
            tx_kbps: 0,
            wan_active: 'idle',
            actividad: 'apagada'
        }
    }

    const getLatencyQuality = (ms, isOnline) => {
        if (!isOnline) return { label: 'Sin respuesta', color: '#ff4444' }
        if (ms === 0) return { label: '< 1 ms / En espera', color: '#888888' }
        if (ms <= 20) return { label: 'Excelente Gaming (Nacional)', color: '#00ff88' }
        if (ms <= 45) return { label: 'Latencia Óptima (DNS)', color: '#00e5ff' }
        if (ms <= 80) return { label: 'Aceptable / Moderada', color: '#ffaa00' }
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
                        <h1 className="noc-title">CENTRO DE OPERACIONES DE RED (NOC)</h1>
                        <span className="noc-badge-model">MikroTik hEX · RouterOS v6.49</span>
                        <span className="noc-badge-model" style={{ borderColor: 'rgba(180, 80, 255, 0.4)', color: '#d18aff' }}>
                            40 Puestos LAN
                        </span>
                    </div>
                    <p className="noc-subtitle">
                        Monitoreo en vivo de las 3 conexiones WAN de fibra óptica, salud del hardware y mapa de 40 PCs de Gaming Center Arcadia
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
                        <span className="ngc-label">LÍNEAS WAN ACTIVAS</span>
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
                        🎮
                    </div>
                    <div className="ngc-body">
                        <span className="ngc-label">PCS EN JUEGO (WAN 3)</span>
                        <div className="ngc-val-row">
                            <span className="ngc-val" style={{ color: '#00ff88' }}>
                                {gamingClients.length} <small>/ 40</small>
                            </span>
                            <span className="ngc-sub">{onlineClients.length} PCs encendidas</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 1: SALUD Y DIAGNÓSTICO DEL MIKROTIK hEX */}
            <div className="noc-health-section">
                <div className="noc-section-title-wrap">
                    <h2 className="noc-section-title">🏥 SALUD DEL ROUTER MIKROTIK</h2>
                    <span className="noc-section-badge">Hardware: Dual-Core 880MHz · 256MB RAM</span>
                </div>

                <div className="noc-health-grid">
                    {/* CPU Load */}
                    <div className="nhc-card">
                        <div className="nhc-head">
                            <span className="nhc-icon">⚙️</span>
                            <span className="nhc-title">USO DE CPU</span>
                            <span className="nhc-badge" style={{
                                color: (health.cpu_load || 0) > 80 ? '#ff4444' : (health.cpu_load || 0) > 50 ? '#ffaa00' : '#00ff88'
                            }}>
                                {(health.cpu_load || 0) < 50 ? '● Normal' : '● Carga Alta'}
                            </span>
                        </div>
                        <div className="nhc-val-row">
                            <span className="nhc-big-num" style={{
                                color: (health.cpu_load || 0) > 80 ? '#ff4444' : (health.cpu_load || 0) > 50 ? '#ffaa00' : '#00ff88'
                            }}>
                                {health.cpu_load || 0}%
                            </span>
                            <span className="nhc-sub-text">Frecuencia: {health.cpu_frequency || 880} MHz</span>
                        </div>
                        <div className="nhc-bar-track">
                            <div 
                                className="nhc-bar-fill"
                                style={{ 
                                    width: `${Math.min(100, Math.max(5, health.cpu_load || 0))}%`,
                                    background: (health.cpu_load || 0) > 80 ? '#ff4444' : (health.cpu_load || 0) > 50 ? '#ffaa00' : 'linear-gradient(90deg, #00ff88, #00e5ff)'
                                }}
                            />
                        </div>
                    </div>

                    {/* Memoria RAM */}
                    <div className="nhc-card">
                        <div className="nhc-head">
                            <span className="nhc-icon">🧠</span>
                            <span className="nhc-title">MEMORIA RAM</span>
                            <span className="nhc-badge" style={{ color: '#00e5ff' }}>
                                Total: {health.total_memory_mb || 256} MB
                            </span>
                        </div>
                        <div className="nhc-val-row">
                            <span className="nhc-big-num" style={{ color: '#00e5ff' }}>
                                {health.free_memory_mb || 214} <small>MB libre</small>
                            </span>
                            <span className="nhc-sub-text">
                                {Math.round(health.memory_pct || 16)}% en uso ({Math.round((health.total_memory_mb || 256) - (health.free_memory_mb || 214))} MB usados)
                            </span>
                        </div>
                        <div className="nhc-bar-track">
                            <div 
                                className="nhc-bar-fill"
                                style={{ 
                                    width: `${Math.min(100, Math.max(5, health.memory_pct || 16))}%`,
                                    background: 'linear-gradient(90deg, #00e5ff, #b450ff)'
                                }}
                            />
                        </div>
                    </div>

                    {/* Uptime y Sistema */}
                    <div className="nhc-card">
                        <div className="nhc-head">
                            <span className="nhc-icon">⏱️</span>
                            <span className="nhc-title">TIEMPO ACTIVO (UPTIME)</span>
                            <span className="nhc-badge" style={{ color: '#00ff88' }}>
                                ● En Línea
                            </span>
                        </div>
                        <div className="nhc-val-row">
                            <span className="nhc-big-num" style={{ color: '#fff', fontSize: '1.25rem' }}>
                                {health.uptime || '1d 06:15:00'}
                            </span>
                            <span className="nhc-sub-text">Sin reinicios ni caídas</span>
                        </div>
                        <div className="nhc-specs-row">
                            <span>Modelo: <strong>{health.board_name || 'hEX'}</strong></span>
                            <span>SO: <strong>{health.version || 'v6.49'}</strong></span>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 2: DETALLE POR LÍNEA WAN */}
            <div className="noc-wans-section">
                <div className="noc-section-title-wrap">
                    <h2 className="noc-section-title">DETALLE POR LÍNEA WAN</h2>
                    <span className="noc-section-badge">Ancho de banda contratado: 1,500 Mbps simétricos totales</span>
                </div>

                <div className="noc-wans-grid">
                    {wans.map((wan, idx) => {
                        const pkts = parsePacketStats(wan.estado)
                        const latMs = Number(wan.latencia_ms) || 0
                        const isOffline = !isWanAlive(wan)
                        const isOnline = !isOffline
                        const hasLatency = latMs > 0 && isOnline
                        const rx = isOnline ? (Number(wan.rx_mbps) || 0) : 0
                        const tx = isOnline ? (Number(wan.tx_mbps) || 0) : 0
                        const isResolving = isOnline && (rx > 0.05 || tx > 0.05)
                        const latInfo = getLatencyQuality(latMs, isOnline || hasLatency)
                        const rxPercent = Math.min(100, Math.round((rx / 500) * 100))
                        const txPercent = Math.min(100, Math.round((tx / 500) * 100))
                        const dnsTarget = wan.target_dns || '200.48.225.146 (DNS Movistar)'

                        return (
                            <div key={wan.id || idx} className={`noc-wan-card ${isOnline ? 'card-online' : 'card-offline'}`}>
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

                                <div className="nwc-metrics-body">
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

                                    <div className="nwc-traffic-bars">
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

            {/* SECCIÓN 3: MAPA DE PISO - 40 COMPUTADORAS CLIENTE */}
            <div className="noc-floor-section">
                <div className="noc-section-title-wrap">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h2 className="noc-section-title">🗺️ MAPA DE PISO: 40 PCs CLIENTES</h2>
                        <span className="noc-section-badge" style={{ borderColor: 'rgba(0, 255, 136, 0.3)', color: '#00ff88' }}>
                            Rango: 192.168.1.101 – 192.168.1.140
                        </span>
                    </div>
                    <span className="noc-section-badge">
                        WAN 3: Gaming · WAN 1 y 2: Navegación
                    </span>
                </div>

                {/* Banner Alerta de Ladrón de Ancho de Banda */}
                {topConsumer && (
                    <div className="noc-top-hogger-banner">
                        <span className="nth-icon">🔥</span>
                        <div className="nth-text">
                            <strong>Mayor Consumo Detectado:</strong> {topConsumer.pc_name} ({topConsumer.ip}) está consumiendo{' '}
                            <span style={{ color: '#ffd600', fontWeight: 800 }}>
                                {(Number(topConsumer.rx_kbps) / 1000).toFixed(1)} Mbps
                            </span>{' '}
                            en {topConsumer.wan_active === 'wan3_gaming' ? 'WAN 3 (Juegos)' : 'WAN 1/2 (Navegación)'}.
                        </div>
                        <button className="nth-btn" onClick={() => setSelectedPc(topConsumer)}>
                            Inspeccionar PC
                        </button>
                    </div>
                )}

                {/* Barra de Filtros y Estadísticas de Piso */}
                <div className="noc-floor-controls">
                    <div className="nfc-stats-pills">
                        <span className="nfc-stat-item">
                            Total: <strong>40</strong>
                        </span>
                        <span className="nfc-stat-item" style={{ color: '#00ff88' }}>
                            ● {onlineClients.length} Encendidas
                        </span>
                        <span className="nfc-stat-item" style={{ color: '#d18aff' }}>
                            🎮 {gamingClients.length} En Juego (WAN 3)
                        </span>
                        <span className="nfc-stat-item" style={{ color: '#00e5ff' }}>
                            🌐 {navClients.length} Navegando (WAN 1/2)
                        </span>
                        <span className="nfc-stat-item" style={{ color: '#888' }}>
                            ⚫ {offlineClients.length} Libres/Off
                        </span>
                    </div>

                    <div className="nfc-filter-tabs">
                        <button 
                            className={`nfc-tab ${clientFilter === 'all' ? 'tab-active' : ''}`}
                            onClick={() => setClientFilter('all')}
                        >
                            Todas (40)
                        </button>
                        <button 
                            className={`nfc-tab ${clientFilter === 'gaming' ? 'tab-active' : ''}`}
                            onClick={() => setClientFilter('gaming')}
                        >
                            🎮 Gaming ({gamingClients.length})
                        </button>
                        <button 
                            className={`nfc-tab ${clientFilter === 'nav' ? 'tab-active' : ''}`}
                            onClick={() => setClientFilter('nav')}
                        >
                            🌐 Navegando ({navClients.length})
                        </button>
                        <button 
                            className={`nfc-tab ${clientFilter === 'heavy' ? 'tab-active' : ''}`}
                            onClick={() => setClientFilter('heavy')}
                        >
                            ⚡ Alto Tráfico ({heavyClients.length})
                        </button>
                        <button 
                            className={`nfc-tab ${clientFilter === 'offline' ? 'tab-active' : ''}`}
                            onClick={() => setClientFilter('offline')}
                        >
                            ⚫ Apagadas ({offlineClients.length})
                        </button>
                    </div>

                    {/* Selector de Orientación: Horizontal (Acostado para PC) vs Vertical (Celular) */}
                    <div className="nfc-orientation-wrap">
                        <button 
                            className={`nfc-orient-btn ${floorOrientation === 'horizontal' ? 'orient-active' : ''}`}
                            onClick={() => setFloorOrientation('horizontal')}
                            title="Vista panorámica horizontal acostada (Recomendada para PC y laptops)"
                        >
                            💻 Acostado (PC)
                        </button>
                        <button 
                            className={`nfc-orient-btn ${floorOrientation === 'vertical' ? 'orient-active' : ''}`}
                            onClick={() => setFloorOrientation('vertical')}
                            title="Vista vertical apilada por islas (Recomendada para teléfonos móviles)"
                        >
                            📱 Vertical (Celular)
                        </button>
                    </div>
                </div>

                {/* RENDERIZADO DE LAS 40 PCS POR ISLAS FÍSICAS */}
                {(() => {
                    const renderPcCard = (pcNum) => {
                        const pc = getPcByNumber(pcNum)
                        const isGaming = pc.online && (pc.wan_active === 'wan3_gaming' || pc.actividad === 'gaming')
                        const isHeavy = pc.online && Number(pc.rx_kbps) > 25000
                        const isNav = pc.online && !isGaming && !isHeavy

                        const matchesFilter = 
                            clientFilter === 'all' ? true :
                            clientFilter === 'gaming' ? isGaming :
                            clientFilter === 'nav' ? isNav :
                            clientFilter === 'heavy' ? isHeavy :
                            clientFilter === 'offline' ? !pc.online : true

                        return (
                            <div 
                                key={pc.ip || pcNum}
                                className={`npc-card ${pc.online ? 'npc-online' : 'npc-offline'} ${isGaming ? 'npc-gaming' : ''} ${isHeavy ? 'npc-heavy' : ''} ${!matchesFilter ? 'npc-dimmed' : ''}`}
                                onClick={() => setSelectedPc(pc)}
                                title={`Puesto #${pcNum} · ${pc.pc_name} (${pc.ip})`}
                            >
                                <div className="npc-top-row">
                                    <div className="npc-title-group">
                                        <span className={`npc-led ${
                                            !pc.online ? 'led-off' : isHeavy ? 'led-yellow' : isGaming ? 'led-purple' : 'led-blue'
                                        }`} />
                                        <span className="npc-name">{pc.pc_name}</span>
                                    </div>
                                    <span className="npc-ip-tag">{pc.ip ? pc.ip.split('.').slice(2).join('.') : `1.${100 + pcNum}`}</span>
                                </div>

                                <div className="npc-wan-row">
                                    {!pc.online ? (
                                        <span className="npc-badge badge-off">Apagada / Libre</span>
                                    ) : isGaming ? (
                                        <span className="npc-badge badge-gaming">🎮 WAN 3</span>
                                    ) : isHeavy ? (
                                        <span className="npc-badge badge-heavy">⚡ Descarga</span>
                                    ) : (
                                        <span className="npc-badge badge-nav">🌐 WAN 1/2</span>
                                    )}
                                </div>

                                <div className="npc-traffic-row">
                                    <div className="npc-rate">
                                        <span className="npc-dir">⬇️</span>
                                        <span className="npc-num" style={{ color: isHeavy ? '#ffd600' : '#00e5ff' }}>
                                            {pc.online ? formatKB(pc.rx_kbps) : '0 KB'}
                                        </span>
                                    </div>
                                    <div className="npc-rate">
                                        <span className="npc-dir">⬆️</span>
                                        <span className="npc-num" style={{ color: '#b450ff' }}>
                                            {pc.online ? formatKB(pc.tx_kbps) : '0 KB'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    if (floorOrientation === 'vertical') {
                        return (
                            <div className="noc-floor-map floor-mode-vertical">
                                {/* MÓDULO 1: FILA DE 5 (Pared Frontal) */}
                                <div className="nfm-v-block">
                                    <div className="nfm-block-header">
                                        <span className="nfm-block-badge">FILA 1 · PARED FRONTAL</span>
                                        <span className="nfm-block-range">Puestos 01 a 05</span>
                                    </div>
                                    <div className="nfm-grid-row-5">
                                        {[1, 2, 3, 4, 5].map(renderPcCard)}
                                    </div>
                                </div>

                                {/* PASILLO 1 */}
                                <div className="nfm-aisle-divider">
                                    <span className="nfm-aisle-line" />
                                    <span className="nfm-aisle-text">🚶‍♂️ PASILLO 1</span>
                                    <span className="nfm-aisle-line" />
                                </div>

                                {/* MÓDULO 2: ISLA CENTRAL 1 (10 PCs Frente a Frente) */}
                                <div className="nfm-v-block nfm-double-island">
                                    <div className="nfm-block-header">
                                        <span className="nfm-block-badge">ISLA CENTRAL 1 (10 PCs)</span>
                                        <span className="nfm-block-range">Puestos 06 a 15 · Frente a Frente</span>
                                    </div>
                                    <div className="nfm-grid-row-5">
                                        {[6, 7, 8, 9, 10].map(renderPcCard)}
                                    </div>
                                    <div className="nfm-desk-separator">
                                        <span className="nds-label">◄ MESA COMPARTIDA · FRENTE A FRENTE ►</span>
                                    </div>
                                    <div className="nfm-grid-row-5">
                                        {[11, 12, 13, 14, 15].map(renderPcCard)}
                                    </div>
                                </div>

                                {/* PASILLO 2 */}
                                <div className="nfm-aisle-divider">
                                    <span className="nfm-aisle-line" />
                                    <span className="nfm-aisle-text">🚶‍♂️ PASILLO 2</span>
                                    <span className="nfm-aisle-line" />
                                </div>

                                {/* MÓDULO 3: ISLA CENTRAL 2 (10 PCs Frente a Frente) */}
                                <div className="nfm-v-block nfm-double-island">
                                    <div className="nfm-block-header">
                                        <span className="nfm-block-badge">ISLA CENTRAL 2 (10 PCs)</span>
                                        <span className="nfm-block-range">Puestos 16 a 25 · Frente a Frente</span>
                                    </div>
                                    <div className="nfm-grid-row-5">
                                        {[16, 17, 18, 19, 20].map(renderPcCard)}
                                    </div>
                                    <div className="nfm-desk-separator">
                                        <span className="nds-label">◄ MESA COMPARTIDA · FRENTE A FRENTE ►</span>
                                    </div>
                                    <div className="nfm-grid-row-5">
                                        {[21, 22, 23, 24, 25].map(renderPcCard)}
                                    </div>
                                </div>

                                {/* PASILLO 3 */}
                                <div className="nfm-aisle-divider">
                                    <span className="nfm-aisle-line" />
                                    <span className="nfm-aisle-text">🚶‍♂️ PASILLO 3</span>
                                    <span className="nfm-aisle-line" />
                                </div>

                                {/* MÓDULO 4: ISLA CENTRAL 3 (10 PCs Frente a Frente) */}
                                <div className="nfm-v-block nfm-double-island">
                                    <div className="nfm-block-header">
                                        <span className="nfm-block-badge">ISLA CENTRAL 3 (10 PCs)</span>
                                        <span className="nfm-block-range">Puestos 26 a 35 · Frente a Frente</span>
                                    </div>
                                    <div className="nfm-grid-row-5">
                                        {[26, 27, 28, 29, 30].map(renderPcCard)}
                                    </div>
                                    <div className="nfm-desk-separator">
                                        <span className="nds-label">◄ MESA COMPARTIDA · FRENTE A FRENTE ►</span>
                                    </div>
                                    <div className="nfm-grid-row-5">
                                        {[31, 32, 33, 34, 35].map(renderPcCard)}
                                    </div>
                                </div>

                                {/* PASILLO 4 */}
                                <div className="nfm-aisle-divider">
                                    <span className="nfm-aisle-line" />
                                    <span className="nfm-aisle-text">🚶‍♂️ PASILLO 4</span>
                                    <span className="nfm-aisle-line" />
                                </div>

                                {/* MÓDULO 5: FILA DE 5 (Pared Posterior) */}
                                <div className="nfm-v-block">
                                    <div className="nfm-block-header">
                                        <span className="nfm-block-badge">FILA 5 · PARED POSTERIOR</span>
                                        <span className="nfm-block-range">Puestos 36 a 40</span>
                                    </div>
                                    <div className="nfm-grid-row-5">
                                        {[36, 37, 38, 39, 40].map(renderPcCard)}
                                    </div>
                                </div>
                            </div>
                        )
                    }

                    // MODO HORIZONTAL ("ACOSTADO" PARA PC)
                    return (
                        <div className="noc-floor-map floor-mode-horizontal">
                            {/* COLUMNA 1: FILA 1 (01 a 05 - De abajo hacia arriba) */}
                            <div className="nfm-h-column nfm-h-single">
                                <div className="nfm-h-head">
                                    <span className="nfm-block-badge">FILA 1</span>
                                    <span className="nfm-h-sub">Pared Izq (01-05)</span>
                                </div>
                                <div className="nfm-h-stack-5">
                                    {[5, 4, 3, 2, 1].map(renderPcCard)}
                                </div>
                            </div>

                            {/* PASILLO 1 */}
                            <div className="nfm-h-aisle-divider">
                                <span className="nfm-h-aisle-text">PASILLO 1</span>
                            </div>

                            {/* COLUMNA 2: ISLA CENTRAL 1 (06 a 15) */}
                            <div className="nfm-h-column nfm-h-double">
                                <div className="nfm-h-head">
                                    <span className="nfm-block-badge">ISLA 1</span>
                                    <span className="nfm-h-sub">PCs 06-15 Frente a Frente</span>
                                </div>
                                <div className="nfm-h-double-grid">
                                    <div className="nfm-h-stack-5">
                                        {[10, 9, 8, 7, 6].map(renderPcCard)}
                                    </div>
                                    <div className="nfm-h-spine" title="Mesa compartida" />
                                    <div className="nfm-h-stack-5">
                                        {[15, 14, 13, 12, 11].map(renderPcCard)}
                                    </div>
                                </div>
                            </div>

                            {/* PASILLO 2 */}
                            <div className="nfm-h-aisle-divider">
                                <span className="nfm-h-aisle-text">PASILLO 2</span>
                            </div>

                            {/* COLUMNA 3: ISLA CENTRAL 2 (16 a 25) */}
                            <div className="nfm-h-column nfm-h-double">
                                <div className="nfm-h-head">
                                    <span className="nfm-block-badge">ISLA 2</span>
                                    <span className="nfm-h-sub">PCs 16-25 Frente a Frente</span>
                                </div>
                                <div className="nfm-h-double-grid">
                                    <div className="nfm-h-stack-5">
                                        {[20, 19, 18, 17, 16].map(renderPcCard)}
                                    </div>
                                    <div className="nfm-h-spine" title="Mesa compartida" />
                                    <div className="nfm-h-stack-5">
                                        {[25, 24, 23, 22, 21].map(renderPcCard)}
                                    </div>
                                </div>
                            </div>

                            {/* PASILLO 3 */}
                            <div className="nfm-h-aisle-divider">
                                <span className="nfm-h-aisle-text">PASILLO 3</span>
                            </div>

                            {/* COLUMNA 4: ISLA CENTRAL 3 (26 a 35) */}
                            <div className="nfm-h-column nfm-h-double">
                                <div className="nfm-h-head">
                                    <span className="nfm-block-badge">ISLA 3</span>
                                    <span className="nfm-h-sub">PCs 26-35 Frente a Frente</span>
                                </div>
                                <div className="nfm-h-double-grid">
                                    <div className="nfm-h-stack-5">
                                        {[30, 29, 28, 27, 26].map(renderPcCard)}
                                    </div>
                                    <div className="nfm-h-spine" title="Mesa compartida" />
                                    <div className="nfm-h-stack-5">
                                        {[35, 34, 33, 32, 31].map(renderPcCard)}
                                    </div>
                                </div>
                            </div>

                            {/* PASILLO 4 */}
                            <div className="nfm-h-aisle-divider">
                                <span className="nfm-h-aisle-text">PASILLO 4</span>
                            </div>

                            {/* COLUMNA 5: FILA 5 (36 a 40) */}
                            <div className="nfm-h-column nfm-h-single">
                                <div className="nfm-h-head">
                                    <span className="nfm-block-badge">FILA 5</span>
                                    <span className="nfm-h-sub">Pared Der (36-40)</span>
                                </div>
                                <div className="nfm-h-stack-5">
                                    {[40, 39, 38, 37, 36].map(renderPcCard)}
                                </div>
                            </div>
                        </div>
                    )
                })()}
            </div>

            {/* MODAL DETALLE DE PC SELECCIONADA */}
            {selectedPc && (
                <div className="npc-modal-backdrop" onClick={() => setSelectedPc(null)}>
                    <div className="npc-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="npc-modal-head">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span className={`npc-led ${selectedPc.online ? 'led-blue' : 'led-off'}`} style={{ width: 14, height: 14 }} />
                                <h3 className="npc-modal-title">{selectedPc.pc_name} · Detalles del Puesto</h3>
                            </div>
                            <button className="npc-modal-close" onClick={() => setSelectedPc(null)}>✕</button>
                        </div>

                        <div className="npc-modal-body">
                            <div className="npm-info-grid">
                                <div className="npm-info-item">
                                    <span className="npm-label">Dirección IP</span>
                                    <span className="npm-val" style={{ color: '#00e5ff' }}>{selectedPc.ip}</span>
                                </div>
                                <div className="npm-info-item">
                                    <span className="npm-label">Estado de Enlace</span>
                                    <span className="npm-val" style={{ color: selectedPc.online ? '#00ff88' : '#ff4444' }}>
                                        {selectedPc.online ? '● Conectada al Switch' : '● Apagada / Desconectada'}
                                    </span>
                                </div>
                                <div className="npm-info-item">
                                    <span className="npm-label">Línea WAN Asignada</span>
                                    <span className="npm-val" style={{ color: '#d18aff' }}>
                                        {selectedPc.wan_active === 'wan3_gaming' ? 'WAN 3: Movistar Juegos (ether3)' : 'WAN 1 / WAN 2: Movistar Navegación'}
                                    </span>
                                </div>
                                <div className="npm-info-item">
                                    <span className="npm-label">Actividad Estimada</span>
                                    <span className="npm-val" style={{ textTransform: 'capitalize' }}>
                                        {selectedPc.actividad || 'Libre'}
                                    </span>
                                </div>
                            </div>

                            <div className="npm-traffic-box">
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
                                    Flujo de Tráfico Instantáneo
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div className="npm-tcard">
                                        <span style={{ fontSize: '0.75rem', color: '#00e5ff' }}>⬇️ Descarga Actual</span>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                                                {formatKB(selectedPc.rx_kbps)}
                                            </span>
                                            <small style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
                                                ({(Number(selectedPc.rx_kbps || 0) / 1000).toFixed(2)} Mbps)
                                            </small>
                                        </div>
                                    </div>
                                    <div className="npm-tcard">
                                        <span style={{ fontSize: '0.75rem', color: '#b450ff' }}>⬆️ Subida Actual</span>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>
                                                {formatKB(selectedPc.tx_kbps)}
                                            </span>
                                            <small style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)' }}>
                                                ({(Number(selectedPc.tx_kbps || 0) / 1000).toFixed(2)} Mbps)
                                            </small>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <p style={{ margin: '14px 0 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                                💡 <em>Las partidas online de Dota 2, Valorant y CS2 están enrutadas automáticamente por la WAN 3 (ether3) para mantener latencia de 6 a 15 ms.</em>
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* SECCIÓN 4: ACCESOS RÁPIDOS A MÓDULOS DEL SISTEMA */}
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
