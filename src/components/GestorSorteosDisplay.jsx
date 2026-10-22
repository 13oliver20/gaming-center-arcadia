import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './GestorSorteosDisplay.css'

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

    const getPeruDate = () => {
        const now = new Date()
        const peruTimeStr = now.toLocaleString("en-US", { timeZone: "America/Lima" })
        const peruDate = new Date(peruTimeStr)
        const year = peruDate.getFullYear()
        const month = String(peruDate.getMonth() + 1).padStart(2, '0')
        const day = String(peruDate.getDate()).padStart(2, '0')
        const jsDayMap = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
        return {
            todayStr: `${year}-${month}-${day}`,
            formattedDate: `${day}/${month}/${year}`,
            todayChar: jsDayMap[peruDate.getDay()]
        }
    }

    const { todayStr, formattedDate, todayChar } = getPeruDate()

    const fetchData = async () => {
        try {
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

            // 3. Winners for today
            const { data: histData } = await supabase
                .from('sorteos_historial')
                .select('*')
                .eq('fecha', todayStr)

            if (histData && histData.length > 0) {
                const userIds = [...new Set(histData.map(h => h.usuario_id))]
                const { data: uData } = await supabase
                    .from('usuarios')
                    .select('id, nickname')
                    .in('id', userIds)
                const userMap = {}
                if (uData) {
                    uData.forEach(u => { userMap[u.id] = u.nickname })
                }
                const map = {}
                histData.forEach(row => {
                    map[row.sorteo_id] = userMap[row.usuario_id] || 'Ganador'
                })
                setTodayWinners(map)
            } else {
                setTodayWinners({})
            }

            // 4. Monthly Winners
            const now = new Date()
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

            const { data: mData } = await supabase
                .from('ganadores_mensuales')
                .select('posicion, puntos, usuario_id, usuarios ( id, nickname )')
                .gte('created_at', startOfMonth)
                .lte('created_at', endOfMonth)
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
            .on('broadcast', { event: 'update_mensuales' }, () => {
                fetchData()
            })
            .on('broadcast', { event: 'update_config' }, (payload) => {
                if (payload.payload) setConfig(payload.payload)
            })
            .subscribe()

        // Polling de respaldo para beneficios (por si replication no está habilitada)
        const beneficiosInterval = setInterval(async () => {
            try {
                const { data, error } = await supabase
                    .from('beneficios_cliente')
                    .select('texto')
                    .limit(1)
                    .single()
                if (!error && data) setBeneficioTexto(data.texto || '')
            } catch (_) {}
        }, 4000)

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

        return () => {
            supabase.removeChannel(channel)
            clearInterval(beneficiosInterval)
            clearInterval(layoutInterval)
        }
    }, [])

    const shouldDisplay = config?.dias_activos?.includes(todayChar)
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
                            <p className="gsd-date">{formattedDate}</p>
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
