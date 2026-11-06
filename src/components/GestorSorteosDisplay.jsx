import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import './GestorSorteosDisplay.css'
import {
    getPeruDateStr,
    getPeruFormattedDate,
    getPeruDayChar,
    getPeruDateParts,
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
    const [monthlyPeriod, setMonthlyPeriod] = useState(() => {
        // Por defecto tomar el mes anterior cerrado o el mes actual
        const now = new Date()
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15)
        const range = getPeruMonthRange(prev)
        return { monthName: range.monthName, year: range.year }
    })
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
            // Fecha actual en Perú (GMT-5)
            const currentTodayStr = getPeruDateStr()

            // Consultas en paralelo para optimizar velocidad y minimizar conexiones simultáneas
            const [cRes, hRes, histRes, mRes, bRes, lRes] = await Promise.all([
                supabase.from('sorteos_configuracion').select('*').eq('id', '00000000-0000-0000-0000-000000000001').single(),
                supabase.from('sorteos_horarios').select('*').order('orden', { ascending: true }),
                supabase.from('sorteos_historial').select('*').eq('fecha', currentTodayStr).order('created_at', { ascending: true }),
                // Obtenemos los ganadores ordenados por fecha descendente para detectar automáticamente el último mes premiado
                supabase.from('ganadores_mensuales')
                    .select('posicion, puntos, created_at, usuario_id, usuarios ( id, nickname, nombre_real )')
                    .order('created_at', { ascending: false })
                    .order('posicion', { ascending: true }),
                supabase.from('beneficios_cliente').select('texto').limit(1).single(),
                supabase.from('display_sorteos_layout').select('*').eq('id', SORTEOS_LAYOUT_ID).single()
            ])

            if (cRes.data) setConfig(cRes.data)
            if (hRes.data) setHorarios(hRes.data)

            const histData = histRes.data
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
                    map[row.sorteo_id] = {
                        nickname: userMap[row.usuario_id] || 'Ganador',
                        premio: row.premio || 'Premio'
                    }
                })
                setTodayWinners(map)
            } else {
                setTodayWinners({})
            }

            // Procesar el último mes premiado disponible
            if (mRes.data && mRes.data.length > 0) {
                // El primer registro tiene la fecha del mes premiado más reciente
                const latestDate = new Date(mRes.data[0].created_at)
                const latestParts = getPeruDateParts(latestDate)
                const latestRange = getPeruMonthRange(latestDate)

                setMonthlyPeriod({
                    monthName: latestRange.monthName,
                    year: latestParts.year
                })

                // Filtrar solo los registros que pertenezcan a ese mes y año premiados
                const filteredWinners = mRes.data.filter(item => {
                    const parts = getPeruDateParts(new Date(item.created_at))
                    return parts.year === latestParts.year && parts.month === latestParts.month
                })

                setMonthlyWinners(filteredWinners)
            } else {
                setMonthlyWinners([])
            }

            if (bRes.data?.texto) {
                setBeneficioTexto(bRes.data.texto)
            }

            if (lRes.data) {
                const safeY = (lRes.data.pos_y > 500 || lRes.data.pos_y < -500) ? 0 : lRes.data.pos_y
                const next = { pos_x: lRes.data.pos_x, pos_y: safeY, scale: lRes.data.scale }
                setLayout(next)
                try { localStorage.setItem('arcadia_sorteos_layout', JSON.stringify(next)) } catch (_) {}
            }

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

        // Polling de respaldo periódico (o al recuperar foco) para sincronización garantizada
        const syncInterval = setInterval(() => {
            fetchData()
        }, 3 * 60 * 1000)

        const fetchSorteosLayout = async () => {
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
        }

        // Polling de respaldo para layout de sorteos cada 5 minutos
        const layoutInterval = setInterval(fetchSorteosLayout, 5 * 60 * 1000)

        // Monitoreo de cambio de día a las 00:00 (hora Perú GMT-5) cada 60s
        const dateCheckInterval = setInterval(() => {
            const currentStr = getPeruDateStr()
            setTodayInfo(prev => {
                if (prev.todayStr !== currentStr) {
                    fetchData()
                    return {
                        todayStr: currentStr,
                        formattedDate: getPeruFormattedDate(),
                        todayChar: getPeruDayChar()
                    }
                }
                return prev
            })
        }, 60 * 1000)

        const handleFocus = () => {
            fetchData()
            fetchSorteosLayout()
        }
        window.addEventListener('focus', handleFocus)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(syncInterval)
            clearInterval(layoutInterval)
            clearInterval(dateCheckInterval)
            window.removeEventListener('focus', handleFocus)
        }
    }, [])

    const headerDate = React.useMemo(() => {
        const parts = getPeruDateParts()
        const DIAS_NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
        const MESES_NOMBRES = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ]
        const dateObj = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0))
        const diaSemana = DIAS_NOMBRES[dateObj.getUTCDay()] || 'Hoy'
        const mesNombre = MESES_NOMBRES[parts.month - 1] || 'Mes'
        return {
            diaSemana,
            diaNum: String(parts.day).padStart(2, '0'),
            mesNombre,
            year: parts.year
        }
    }, [todayInfo.todayStr])

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
                            <div className="gsd-diario-header">
                                <span className="gsd-raffle-badge">🎁 SORTEOS EN VIVO</span>
                                <h3 className="gsd-title gsd-diario-title">
                                    GANADORES DE <span className="gsd-highlight-pink">HOY</span>
                                </h3>
                                <p className="gsd-date gsd-diario-sub">
                                    {headerDate.diaSemana.toUpperCase()}, {headerDate.diaNum} DE {headerDate.mesNombre.toUpperCase()}
                                </p>
                            </div>

                            <div className="gsd-diarios-list">
                                {horarios.map((h, idx) => {
                                    const winner = todayWinners[h.id]
                                    const winnerNick = winner ? (typeof winner === 'object' ? winner.nickname : winner) : null
                                    const winnerPrize = winner && typeof winner === 'object' && winner.premio ? winner.premio : 'Premio Sorpresa'
                                    const hasWinner = Boolean(winnerNick)

                                    return (
                                        <div key={h.id} className={`gsd-diario-card ${hasWinner ? 'has-winner' : 'is-waiting'}`}>
                                            <div className="gdc-accent-bar"></div>
                                            <div className="gdc-badge">
                                                <span className="gdc-icon">{hasWinner ? '🏆' : '⏰'}</span>
                                                <span className="gdc-time-tag">{h.hora}</span>
                                            </div>
                                            <div className="gdc-info">
                                                {hasWinner ? (
                                                    <>
                                                        <div className="gdc-nick">@{winnerNick.toUpperCase()}</div>
                                                        <div className="gdc-sub">Ganador del Sorteo {h.hora}</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="gdc-title">
                                                            SORTEO&nbsp;{h.hora.toUpperCase().replace(/\s+/g, '\u00A0')}
                                                        </div>
                                                        <div className="gdc-waiting">
                                                            <span className="gdc-pulse-dot" />
                                                            <span>Esperando resultados...</span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <div className="gdc-right-badge">
                                                {hasWinner ? (
                                                    <div className="gdc-prize-box">
                                                        <span className="gdc-prize-val">{winnerPrize.toUpperCase()}</span>
                                                        <span className="gdc-prize-lbl">PREMIO</span>
                                                    </div>
                                                ) : (
                                                    <div className="gdc-status-badge">
                                                        <span className="gdc-status-icon">🎲</span>
                                                        <span className="gdc-status-text">EN SALA</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}

                                {/* TARJETA INFORMATIVA: REGLA DE PARTICIPACIÓN EN SALA */}
                                <div className="gsd-diario-card gsd-diario-info-card">
                                    <div className="gdc-accent-bar accent-cyan"></div>
                                    <div className="gdc-badge">
                                        <span className="gdc-icon">🎮</span>
                                        <span className="gdc-time-tag" style={{ color: '#00e5ff' }}>LAN</span>
                                    </div>
                                    <div className="gdc-info">
                                        <div className="gdc-info-title">PARTICIPACIÓN AUTOMÁTICA</div>
                                        <div className="gdc-info-sub">Solo debes estar jugando en cabina</div>
                                    </div>
                                    <div className="gdc-right-badge">
                                        <div className="gdc-status-badge status-cyan">
                                            <span className="gdc-status-icon">⭐</span>
                                            <span className="gdc-status-text" style={{ color: '#00e5ff' }}>ACTIVO</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* FOOTER MOTIVACIONAL IDÉNTICO AL MENSUAL */}
                            <div className="gsd-diario-footer">
                                <span className="gsd-footer-icon">⚡</span>
                                <span>¡Inicia sesión en cabina y participa automáticamente!</span>
                            </div>
                        </div>
                    )}
                    {activeTab === 'mensuales' && (
                        <div className="gsd-mensuales-view">
                            <div className="gsd-mensual-header">
                                <span className="gsd-hall-badge">🏆 SALÓN DE LA FAMA</span>
                                <h3 className="gsd-title gsd-mensual-title">
                                    GANADORES DE <span className="gsd-month-highlight">{monthlyPeriod.monthName.toUpperCase()}</span>
                                </h3>
                                <p className="gsd-date gsd-mensual-sub">TOP 5 · CONCURRENCIA ARCADIA</p>
                            </div>
                            <div className="gsd-podium-list">
                                {[1, 2, 3, 4, 5].map(pos => {
                                    const winner = monthlyWinners.find(w => w.posicion === pos)
                                    const isChampion = pos === 1
                                    return (
                                        <div key={pos} className={`gsd-podium-card podium-pos-${pos} ${isChampion ? 'champion' : ''}`}>
                                            <div className="gpc-accent-bar"></div>
                                            <div className="gpc-badge">
                                                {pos === 1 && <span className="gpc-medal">👑</span>}
                                                {pos === 2 && <span className="gpc-medal">🥈</span>}
                                                {pos === 3 && <span className="gpc-medal">🥉</span>}
                                                {pos === 4 && <span className="gpc-medal">🎖️</span>}
                                                {pos === 5 && <span className="gpc-medal">🎖️</span>}
                                                <span className="gpc-rank">{pos}º</span>
                                            </div>
                                            <div className="gpc-player-info">
                                                {winner && winner.usuarios ? (
                                                    <div className="gpc-nick">@{winner.usuarios.nickname?.toUpperCase()}</div>
                                                ) : (
                                                    <div className="gpc-waiting">Esperando ganador...</div>
                                                )}
                                            </div>
                                            <div className="gpc-right-badge">
                                                {winner && winner.puntos ? (
                                                    <div className="gpc-pts-box">
                                                        <span className="gpc-pts-val">{winner.puntos}</span>
                                                        <span className="gpc-pts-lbl">PTS</span>
                                                    </div>
                                                ) : (
                                                    <div className="gpc-honor-badge">
                                                        <span className="gpc-honor-star">⭐</span>
                                                        <span className="gpc-honor-text">TOP 5</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="gsd-mensual-footer">
                                <span className="gsd-footer-icon">⚡</span>
                                <span>¡Acumula horas en Arcadia y entra al Salón de la Fama!</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default GestorSorteosDisplay
