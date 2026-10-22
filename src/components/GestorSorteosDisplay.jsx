import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './GestorSorteosDisplay.css'
import {
    getPeruDateStr,
    getPeruFormattedDate,
    getPeruDayChar,
    getPeruMonthRange
} from '../utils/peruTime'

const SORTEOS_LAYOUT_ID = 'sorteos_layout'
const DEFAULT_SORTEOS_LAYOUT = { pos_x: 30, pos_y: 0, scale: 1.0 }

const getInitialLayout = () => {
    try {
        const cached = localStorage.getItem('arcadia_sorteos_layout')
        if (cached) return JSON.parse(cached)
    } catch (_) {}
    return DEFAULT_SORTEOS_LAYOUT
}

const GestorSorteosDisplay = ({ onLoaded }) => {
    const [config, setConfig] = useState(null)
    const [horarios, setHorarios] = useState([])
    const [todayWinners, setTodayWinners] = useState({})
    const [monthlyWinners, setMonthlyWinners] = useState([])
    const [activeTab, setActiveTab] = useState('diarios')
    const [beneficioTexto, setBeneficioTexto] = useState('')
    const [showBeneficios, setShowBeneficios] = useState(false)
    const [layout, setLayout] = useState(getInitialLayout)
    const [layoutLoaded, setLayoutLoaded] = useState(false)

    // Estado de fecha en Perú (GMT-5) que se actualiza reactivamente a las 00:00
    const [todayInfo, setTodayInfo] = useState(() => ({
        todayStr: getPeruDateStr(),
        formattedDate: getPeruFormattedDate(),
        todayChar: getPeruDayChar()
    }))

    const fetchData = async () => {
        try {
            // Fecha y rango de mes actual en Perú (GMT-5)
            const currentTodayStr = getPeruDateStr()
            const { startIso, endIso } = getPeruMonthRange()

            // 1. Config
            const { data: cData } = await supabase
                .from('sorteos_configuracion')
                .select('*')
                .eq('id', '00000000-0000-0000-0000-000000000001')
                .single()
            if (cData) setConfig(cData)

            // 2. Horarios
            const { data: hData } = await supabase
                .from('sorteos_horarios')
                .select('*')
                .order('orden', { ascending: true })
            if (hData) setHorarios(hData)

            // 3. Ganadores del día actual (si cambió el día a las 00:00, no habrá registros y se mostrará vacío esperando nuevos ganadores)
            const { data: histData } = await supabase
                .from('sorteos_historial')
                .select('*')
                .eq('fecha', currentTodayStr)
                .order('created_at', { ascending: true })

            if (histData && histData.length > 0) {
                const userIds = [...new Set(histData.map(h => h.usuario_id))]
                const { data: uData } = await supabase
                    .from('usuarios')
                    .select('id, nickname, nombre_real')
                    .in('id', userIds)
                const userMap = {}
                if (uData) {
                    uData.forEach(u => { userMap[u.id] = u.nickname || u.nombre_real || 'Ganador' })
                }
                const map = {}
                histData.forEach(row => {
                    map[row.sorteo_id] = userMap[row.usuario_id] || 'Ganador'
                })
                setTodayWinners(map)
            } else {
                setTodayWinners({})
            }

            // 4. Ganadores Mensuales dentro del mes actual en Perú (desde 00:00 del día 1 hasta 23:59:59 del último día del mes)
            const { data: mData } = await supabase
                .from('ganadores_mensuales')
                .select('posicion, puntos, usuario_id, usuarios ( id, nickname, nombre_real )')
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .order('posicion', { ascending: true })

            if (mData) {
                setMonthlyWinners(mData)
            } else {
                setMonthlyWinners([])
            }

            // 5. Beneficios Cliente (separate try to avoid suppressing other fetches)
            try {
                const { data: bData, error: bError } = await supabase
                    .from('beneficios_cliente')
                    .select('texto')
                    .limit(1)
                    .single()
                if (!bError && bData) setBeneficioTexto(bData.texto || '')
            } catch (_) {
                // no rows yet — ignore
            }

            // Layout del panel de sorteos
            try {
                const { data: lData, error: lErr } = await supabase
                    .from('display_sorteos_layout')
                    .select('*')
                    .eq('id', SORTEOS_LAYOUT_ID)
                    .single()
                if (!lErr && lData) {
                    const safeY = (lData.pos_y > 500 || lData.pos_y < -500) ? 0 : lData.pos_y
                    const next = { pos_x: lData.pos_x, pos_y: safeY, scale: lData.scale }
                    setLayout(next)
                    try { localStorage.setItem('arcadia_sorteos_layout', JSON.stringify(next)) } catch (_) {}
                }
            } catch (_) {}

        } catch (error) {
            console.error("Error fetching display sorteos:", error)
        } finally {
            setLayoutLoaded(true)
            if (onLoaded) onLoaded()
        }
    }

    useEffect(() => {
        fetchData()

        const channel = supabase.channel('public:sorteos_all', {
            config: { broadcast: { ack: true } }
        })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sorteos_configuracion' }, (payload) => {
                if (payload.new) setConfig(payload.new)
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sorteos_horarios' }, () => {
                fetchData()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sorteos_historial' }, () => {
                fetchData()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'ganadores_mensuales' }, () => {
                fetchData()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'beneficios_cliente' }, (payload) => {
                if (payload.new) setBeneficioTexto(payload.new.texto || '')
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'display_sorteos_layout' }, (payload) => {
                if (payload.new) {
                    const safeY = (payload.new.pos_y > 500 || payload.new.pos_y < -500) ? 0 : payload.new.pos_y
                    setLayout({ pos_x: payload.new.pos_x, pos_y: safeY, scale: payload.new.scale })
                }
            })
            .on('broadcast', { event: 'update_sorteos' }, () => {
                fetchData()
            })
            .on('broadcast', { event: 'update_mensuales' }, () => {
                fetchData()
            })
            .on('broadcast', { event: 'update_beneficios' }, (payload) => {
                if (payload.payload?.texto !== undefined) {
                    setBeneficioTexto(payload.payload.texto)
                }
                fetchData()
            })
            .on('broadcast', { event: 'update_config' }, (payload) => {
                if (payload.payload) setConfig(payload.payload)
                fetchData()
            })
            .subscribe()

        // Polling constante cada 3s para sincronización garantizada de sorteos, ganadores y beneficios en tiempo real
        const syncInterval = setInterval(() => {
            fetchData()
        }, 3000)

        // Polling de respaldo para layout de sorteos
        const layoutInterval = setInterval(async () => {
            try {
                const { data, error } = await supabase
                    .from('display_sorteos_layout')
                    .select('*')
                    .eq('id', SORTEOS_LAYOUT_ID)
                    .single()
                if (!error && data) {
                    const safeY = (data.pos_y > 500 || data.pos_y < -500) ? 0 : data.pos_y
                    setLayout({ pos_x: data.pos_x, pos_y: safeY, scale: data.scale })
                }
            } catch (_) {}
        }, 2000)

        // Monitoreo constante de cambio de día a las 00:00 (hora Perú GMT-5) para restablecer espacios automáticamente
        const dateCheckInterval = setInterval(() => {
            const currentStr = getPeruDateStr()
            setTodayInfo(prev => {
                if (prev.todayStr !== currentStr) {
                    // El día ha cambiado en Perú: refrescar datos inmediatamente
                    fetchData()
                    return {
                        todayStr: currentStr,
                        formattedDate: getPeruFormattedDate(),
                        todayChar: getPeruDayChar()
                    }
                }
                return prev
            })
        }, 5000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(syncInterval)
            clearInterval(layoutInterval)
            clearInterval(dateCheckInterval)
        }
    }, [])

    const shouldDisplay = config?.dias_activos?.includes(todayInfo.todayChar)
    if (!shouldDisplay || !layoutLoaded) return null

    const widgetStyle = {
        right: `${layout.pos_x}px`,
        top: `calc(50% + ${layout.pos_y}px)`,
        transform: `translateY(-50%) scale(${layout.scale})`,
        transformOrigin: 'top right',
    }

    return (
        <div className="gsd-widget" style={widgetStyle}>
            <div className="gsd-tabs">
                <button
                    className={`gsd-tab ${activeTab === 'diarios' && !showBeneficios ? 'active diarios' : ''}`}
                    onClick={() => { setActiveTab('diarios'); setShowBeneficios(false) }}
                >
                    <span className="gsd-icon">📅</span> DIARIOS
                </button>
                <button
                    className={`gsd-tab ${activeTab === 'mensuales' && !showBeneficios ? 'active mensuales' : ''}`}
                    onClick={() => { setActiveTab('mensuales'); setShowBeneficios(false) }}
                >
                    <span className="gsd-icon">🏆</span> MENSUALES
                </button>
            </div>

            <button
                className={`gsd-beneficios-btn ${showBeneficios ? 'active' : ''}`}
                onClick={() => setShowBeneficios(prev => !prev)}
            >
                <span className="gsd-icon">🎁</span> BENEFICIOS DE SER USUARIO
                <span className="gsd-beneficios-arrow">{showBeneficios ? '▲' : '▼'}</span>
            </button>

            {showBeneficios && (
                <div className="gsd-beneficios-panel">
                    {beneficioTexto
                        ? <p className="gsd-beneficios-texto">{beneficioTexto}</p>
                        : <p className="gsd-beneficios-empty">Sin beneficios configurados.</p>
                    }
                </div>
            )}

            {!showBeneficios && (
                <div className="gsd-body">
                    {activeTab === 'diarios' && (
                        <div className="gsd-diarios-view">
                            <h3 className="gsd-title">GANADORES DEL DIA</h3>
                            <p className="gsd-date">{todayInfo.formattedDate}</p>
                            <div className="gsd-horarios-list">
                                {horarios.map(h => {
                                    const winnerName = todayWinners[h.id]
                                    return (
                                        <div key={h.id} className="gsd-horario-card">
                                            <div className="gsd-horario-accent"></div>
                                            <div className="gsd-horario-content">
                                                {winnerName ? (
                                                    <>
                                                        <div className="gsd-horario-time">GANADOR DEL SORTEO {h.hora.toUpperCase()}</div>
                                                        <div className="gsd-winner-name">✅ {winnerName.toUpperCase()}</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="gsd-horario-time">SORTEO {h.hora.toUpperCase()}</div>
                                                        <div className="gsd-winner-waiting">Esperando resultados...</div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                    {activeTab === 'mensuales' && (
                        <div className="gsd-mensuales-view">
                            <h3 className="gsd-title">MEJORES DEL MES</h3>
                            <p className="gsd-date">TOP 5</p>
                            <div className="gsd-horarios-list">
                                {[1, 2, 3, 4, 5].map(pos => {
                                    const winner = monthlyWinners.find(w => w.posicion === pos)
                                    return (
                                        <div key={pos} className={`gsd-horario-card pos-${pos}`}>
                                            <div className="gsd-mensual-accent"></div>
                                            <div className="gsd-horario-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div className="gsd-mensual-pos">{pos}º LUGAR</div>
                                                    {winner && winner.usuarios ? (
                                                        <div className="gsd-winner-name">@{winner.usuarios.nickname?.toUpperCase() || 'USUARIO'}</div>
                                                    ) : (
                                                        <div className="gsd-winner-waiting" style={{ color: '#8c96a3', marginTop: '4px', fontSize: '1rem' }}>Esperando resultados...</div>
                                                    )}
                                                </div>
                                                {winner && winner.puntos && (
                                                    <div className="gsd-mensual-puntos">
                                                        <span className="gsd-pts-val">{winner.puntos}</span>
                                                        <span className="gsd-pts-lbl">PTS</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default GestorSorteosDisplay
