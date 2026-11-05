import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import './GestorGanadoresMensuales.css'
import {
    getPeruDateParts,
    getPeruMonthRange,
    getPeruMonthTargetDate,
    getPeruMonthName
} from '../../utils/peruTime'
import { searchUsersList, highlightMatch } from '../../utils/userSearch'

const MESES_LIST = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const GestorGanadoresMensuales = () => {
    // Mes actual en Perú
    const { year: curPeruYear, month: curPeruMonth } = getPeruDateParts()
    const prevMonthNumber = curPeruMonth === 1 ? 12 : curPeruMonth - 1
    const prevYearNumber = curPeruMonth === 1 ? curPeruYear - 1 : curPeruYear

    // Periodo seleccionado para gestionar (por defecto el mes anterior que acaba de cerrar)
    const [selectedPeriod, setSelectedPeriod] = useState({
        year: prevYearNumber,
        month: prevMonthNumber
    })

    // State for History
    const [historialAgrupado, setHistorialAgrupado] = useState({})
    const [expandedYears, setExpandedYears] = useState({})
    const [loadingHistorial, setLoadingHistorial] = useState(false)

    // Helper to format month number to string
    const getMonthName = (monthIndex) => {
        return MESES_LIST[monthIndex] || ''
    }

    // State for the 5 positions
    // We will store { usuario: { id, nickname, nombre_real }, puntos: number | '' }
    const [ganadores, setGanadores] = useState([
        { pos: 1, usuario: null, puntos: '' },
        { pos: 2, usuario: null, puntos: '' },
        { pos: 3, usuario: null, puntos: '' },
        { pos: 4, usuario: null, puntos: '' },
        { pos: 5, usuario: null, puntos: '' },
    ])

    // Cached users for instant master search
    const allUsersRef = useRef([])

    // Autocomplete states per position
    const [searchTerms, setSearchTerms] = useState({ 1: '', 2: '', 3: '', 4: '', 5: '' })
    const [searchResults, setSearchResults] = useState({ 1: [], 2: [], 3: [], 4: [], 5: [] })
    const [activeSearch, setActiveSearch] = useState(null) // pos 1-5 currently focused
    const searchRef = useRef(null)

    // UI Feedback
    const [loadingDb, setLoadingDb] = useState(false)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)
    const [confirmDialogPos, setConfirmDialogPos] = useState(null)
    const [isEditing, setIsEditing] = useState({ 1: false, 2: false, 3: false, 4: false, 5: false })

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setActiveSearch(null)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const channelRef = useRef(null)
    useEffect(() => {
        const channel = supabase.channel('public:sorteos_all', {
            config: {
                broadcast: { ack: true }
            }
        })
        channel.subscribe()
        channelRef.current = channel
        return () => supabase.removeChannel(channel)
    }, [])

    // Cargar datos al cambiar de periodo seleccionado
    useEffect(() => {
        fetchGanadores(selectedPeriod.year, selectedPeriod.month)
        fetchHistorial()
    }, [selectedPeriod.year, selectedPeriod.month])

    // Cargar historial inicial
    const fetchHistorial = async () => {
        setLoadingHistorial(true)
        try {
            const { data, error } = await supabase
                .from('ganadores_mensuales')
                .select('posicion, puntos, created_at, usuario_id, usuarios ( id, nickname, nombre_real )')
                .order('created_at', { ascending: false })
                .order('posicion', { ascending: true })

            if (error && error.code !== '42P01') {
                console.error("Error fetching historial:", error)
                return
            }

            if (data && data.length > 0) {
                const agrupado = {}

                data.forEach(item => {
                    const itemParts = getPeruDateParts(new Date(item.created_at))
                    const year = itemParts.year
                    const month = itemParts.month - 1 // 0-indexed para getMonthName

                    if (!agrupado[year]) agrupado[year] = {}
                    if (!agrupado[year][month]) agrupado[year][month] = []

                    agrupado[year][month].push(item)
                })

                // Ordenar por posición ascendente
                Object.keys(agrupado).forEach(yr => {
                    Object.keys(agrupado[yr]).forEach(mo => {
                        agrupado[yr][mo].sort((a, b) => a.posicion - b.posicion)
                    })
                })

                setHistorialAgrupado(agrupado)

                // Expandir por defecto el año más reciente
                const years = Object.keys(agrupado).sort((a, b) => b - a)
                if (years.length > 0) {
                    setExpandedYears({ [years[0]]: true })
                }
            } else {
                setHistorialAgrupado({})
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoadingHistorial(false)
        }
    }

    const toggleYear = (year) => {
        setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }))
    }

    const fetchGanadores = async (year, month) => {
        setLoadingDb(true)
        try {
            // Rango exacto del mes seleccionado en hora de Perú
            const { startIso, endIso } = getPeruMonthRange(year, month)

            const { data, error } = await supabase
                .from('ganadores_mensuales')
                .select('posicion, puntos, usuario_id, usuarios ( id, nickname, nombre_real )')
                .gte('created_at', startIso)
                .lte('created_at', endIso)

            if (error) {
                if (error.code === '42P01') {
                    console.log('La tabla ganadores_mensuales no existe aún. Mostrará panel vacío.')
                } else {
                    console.error('Error fetching ganadores:', error)
                }
            } else {
                // Mapear exactamente las 5 posiciones para el mes consultado
                const updatedGanadores = [1, 2, 3, 4, 5].map(pos => {
                    const found = (data || []).find(r => r.posicion === pos)
                    return {
                        pos,
                        usuario: found?.usuarios || null,
                        puntos: found?.puntos != null ? found.puntos : ''
                    }
                })
                setGanadores(updatedGanadores)
            }

            // Cargar usuarios en caché para el Buscador Maestro instantáneo si no están en caché
            if (!allUsersRef.current || allUsersRef.current.length === 0) {
                const { data: allUsers } = await supabase
                    .from('usuarios')
                    .select('id, nickname, nombre_real')
                    .order('nickname', { ascending: true })
                if (allUsers) {
                    allUsersRef.current = allUsers
                }
            }

        } catch (e) {
            console.error(e)
        } finally {
            setLoadingDb(false)
        }
    }

    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    // Buscador Maestro: Búsqueda 0ms con algoritmo de relevancia profesional
    const searchUsers = (pos, text) => {
        const users = allUsersRef.current
        if (users && users.length > 0) {
            const results = searchUsersList(users, text, 10)
            setSearchResults(prev => ({ ...prev, [pos]: results }))
        } else {
            supabase
                .from('usuarios')
                .select('id, nickname, nombre_real')
                .order('nickname', { ascending: true })
                .then(({ data }) => {
                    if (data) {
                        allUsersRef.current = data
                        const results = searchUsersList(data, text, 10)
                        setSearchResults(prev => ({ ...prev, [pos]: results }))
                    }
                })
        }
    }

    const handleSearchChange = (pos, val) => {
        setSearchTerms(prev => ({ ...prev, [pos]: val }))
        searchUsers(pos, val)
    }

    const handleSearchFocus = (pos) => {
        setActiveSearch(pos)
        searchUsers(pos, searchTerms[pos] || '')
    }

    const selectUser = (pos, user) => {
        const alreadyInPos = ganadores.find(g => g.usuario && g.usuario.id === user.id)
        if (alreadyInPos && alreadyInPos.pos !== pos) {
            showToast(`El usuario @${user.nickname} ya está en la posición ${alreadyInPos.pos}`, 'error')
            return
        }

        let newGanadores = [...ganadores]
        const idx = newGanadores.findIndex(g => g.pos === pos)
        if (idx !== -1) {
            newGanadores[idx].usuario = user
        }
        setGanadores(newGanadores)
        setActiveSearch(null)
        setSearchTerms(prev => ({ ...prev, [pos]: '' }))
    }

    const clearUser = (pos) => {
        let newGanadores = [...ganadores]
        const idx = newGanadores.findIndex(g => g.pos === pos)
        if (idx !== -1) {
            newGanadores[idx].usuario = null
            newGanadores[idx].puntos = ''
        }
        setGanadores(newGanadores)
    }

    const handlePointsChange = (pos, val) => {
        if (val !== '' && !/^\d+$/.test(val)) return

        let newGanadores = [...ganadores]
        const idx = newGanadores.findIndex(g => g.pos === pos)
        if (idx !== -1) {
            newGanadores[idx].puntos = val
        }
        setGanadores(newGanadores)
    }

    const handleSaveSinglePos = (pos) => {
        const g = ganadores.find(x => x.pos === pos)
        if (g.usuario) {
            if (g.pos <= 3 && g.puntos === '') {
                showToast(`La posición ${g.pos} tiene usuario pero no tiene puntos asignados.`, 'error')
                return
            }
        } else {
            if (g.puntos !== '') {
                g.puntos = ''
            }
        }
        setConfirmDialogPos(pos)
    }

    const handleSaveConfirm = async () => {
        if (!confirmDialogPos) return
        setSaving(true)
        try {
            const targetData = ganadores.find(g => g.pos === confirmDialogPos)

            // Rango y fecha meta para el mes seleccionado
            const { startIso, endIso } = getPeruMonthRange(selectedPeriod.year, selectedPeriod.month)
            const targetCreatedAt = getPeruMonthTargetDate(selectedPeriod.year, selectedPeriod.month)

            // Eliminar registro anterior de esa posición en el mes seleccionado
            const { error: delError } = await supabase
                .from('ganadores_mensuales')
                .delete()
                .eq('posicion', confirmDialogPos)
                .gte('created_at', startIso)
                .lte('created_at', endIso)

            if (delError && delError.code !== '42P01') {
                throw delError
            }

            if (targetData && targetData.usuario) {
                const { error: insError } = await supabase
                    .from('ganadores_mensuales')
                    .insert([{
                        posicion: targetData.pos,
                        usuario_id: targetData.usuario.id,
                        puntos: targetData.puntos || null,
                        created_at: targetCreatedAt
                    }])

                if (insError) throw insError
            }

            const monthName = MESES_LIST[selectedPeriod.month - 1]
            showToast(`✅ Guardado para ${confirmDialogPos}º Lugar (${monthName} ${selectedPeriod.year}).`, 'success')
            setIsEditing(prev => ({ ...prev, [confirmDialogPos]: false }))
            setConfirmDialogPos(null)

            // Refrescar historial para reflejar los cambios
            fetchHistorial()

            // Emitir evento para actualizar en tiempo real el Display de TV
            if (channelRef.current) {
                channelRef.current.send({
                    type: 'broadcast',
                    event: 'update_mensuales',
                    payload: {}
                }).catch(err => console.error("Broadcast error:", err))
            }
        } catch (e) {
            console.error(e)
            showToast('❌ Ocurrió un error al guardar: ' + e.message, 'error')
            setConfirmDialogPos(null)
        } finally {
            setSaving(false)
        }
    }

    // Funciones para navegar entre meses
    const handlePrevMonth = () => {
        setSelectedPeriod(prev => {
            const newMonth = prev.month === 1 ? 12 : prev.month - 1
            const newYear = prev.month === 1 ? prev.year - 1 : prev.year
            return { year: newYear, month: newMonth }
        })
    }

    const handleNextMonth = () => {
        setSelectedPeriod(prev => {
            const newMonth = prev.month === 12 ? 1 : prev.month + 1
            const newYear = prev.month === 12 ? prev.year + 1 : prev.year
            return { year: newYear, month: newMonth }
        })
    }

    const handleSelectCurrentMonth = () => {
        setSelectedPeriod({ year: curPeruYear, month: curPeruMonth })
    }

    const handleSelectPrevClosedMonth = () => {
        setSelectedPeriod({ year: prevYearNumber, month: prevMonthNumber })
    }

    const loadHistoricalMonth = (year, monthZeroIndexed) => {
        setSelectedPeriod({ year: Number(year), month: Number(monthZeroIndexed) + 1 })
        window.scrollTo({ top: 0, behavior: 'smooth' })
        showToast(`Cargando ganadores de ${MESES_LIST[monthZeroIndexed]} ${year}...`, 'success')
    }

    const selectedMonthName = MESES_LIST[selectedPeriod.month - 1]

    return (
        <div className="ggm-page">
            <div className="ggm-header">
                <div className="ggm-header-left">
                    <span className="ggm-header-icon">🏆</span>
                    <div>
                        <h2 className="ggm-title">Gestor de Ganadores Mensuales</h2>
                        <p className="ggm-subtitle">Configura los mejores 5 clientes por concurrencia mensual para la pantalla de TV</p>
                    </div>
                </div>

                {/* BARRA DE NAVEGACIÓN Y SELECCIÓN DE MES */}
                <div className="ggm-period-bar">
                    <button className="ggm-period-nav-btn" onClick={handlePrevMonth} title="Mes anterior">
                        ◀
                    </button>
                    <div className="ggm-period-display">
                        <span className="ggm-period-label">MES PREMIADO</span>
                        <div className="ggm-period-value">
                            <span className="ggm-period-month">{selectedMonthName}</span>
                            <span className="ggm-period-year">{selectedPeriod.year}</span>
                        </div>
                    </div>
                    <button className="ggm-period-nav-btn" onClick={handleNextMonth} title="Mes siguiente">
                        ▶
                    </button>
                    <div className="ggm-quick-shortcuts">
                        <button
                            className={`ggm-quick-btn ${selectedPeriod.year === prevYearNumber && selectedPeriod.month === prevMonthNumber ? 'active' : ''}`}
                            onClick={handleSelectPrevClosedMonth}
                            title="Ir al mes cerrado que acaba de terminar"
                        >
                            🏅 {MESES_LIST[prevMonthNumber - 1]} (Recién cerrado)
                        </button>
                        <button
                            className={`ggm-quick-btn ${selectedPeriod.year === curPeruYear && selectedPeriod.month === curPeruMonth ? 'active' : ''}`}
                            onClick={handleSelectCurrentMonth}
                            title="Ir al mes en curso"
                        >
                            📅 {MESES_LIST[curPeruMonth - 1]} (En curso)
                        </button>
                    </div>
                </div>
            </div>

            {loadingDb && (
                <div className="ggm-loading-banner">
                    <span>⚡ Cargando ganadores de {selectedMonthName} {selectedPeriod.year}...</span>
                </div>
            )}

            <div className="ggm-cards-container" ref={searchRef}>
                {ganadores.map(item => {
                    const pos = item.pos
                    const isTop3 = pos <= 3
                    return (
                        <div key={pos} className={`ggm-card pos-${pos}`}>
                            <div className="ggm-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{pos}º Lugar</span>
                                {isEditing[pos] ? (
                                    <button
                                        className="ggm-edit-pos-btn"
                                        onClick={() => handleSaveSinglePos(pos)}
                                        title="Guardar este lugar"
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0', color: '#00e676', transition: '0.2s' }}
                                    >
                                        💾
                                    </button>
                                ) : (
                                    <button
                                        className="ggm-edit-pos-btn"
                                        onClick={() => setIsEditing(prev => ({ ...prev, [pos]: true }))}
                                        title="Habilitar edición"
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0', color: '#ffeb3b', opacity: 0.8, transition: '0.2s' }}
                                        onMouseOver={e => e.target.style.opacity = 1}
                                        onMouseOut={e => e.target.style.opacity = 0.8}
                                    >
                                        ✏️
                                    </button>
                                )}
                            </div>

                            {/* SEARCH / USER */}
                            {!item.usuario ? (
                                <div className="ggm-search-wrapper">
                                    <input
                                        className="ggm-search-input"
                                        placeholder="Buscar @usuario o nombre..."
                                        value={searchTerms[pos]}
                                        onChange={(e) => handleSearchChange(pos, e.target.value)}
                                        onFocus={() => isEditing[pos] && handleSearchFocus(pos)}
                                        disabled={!isEditing[pos]}
                                    />
                                    {activeSearch === pos && (
                                        <div className="ggm-autocomplete-dropdown">
                                            <div className="ggm-dropdown-header">
                                                <span className="ggm-col-user">👤 USUARIO</span>
                                                <span className="ggm-col-name">📋 NOMBRE REAL</span>
                                            </div>
                                            {searchResults[pos]?.length > 0 ? (
                                                searchResults[pos].map(u => (
                                                    <div
                                                        key={u.id}
                                                        className="ggm-autocomplete-item"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => selectUser(pos, u)}
                                                    >
                                                        <span className="ggm-col-user">
                                                            <span className="ggm-auto-nick">@{highlightMatch(u.nickname, searchTerms[pos])}</span>
                                                        </span>
                                                        <span className="ggm-col-name">
                                                            <span className="ggm-auto-name">{highlightMatch(u.nombre_real, searchTerms[pos])}</span>
                                                        </span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div style={{ padding: '16px 14px', color: 'rgba(255, 255, 255, 0.45)', fontSize: '0.85rem', textAlign: 'center' }}>
                                                    No se encontraron usuarios coincidentes
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="ggm-user-selected">
                                    <div className="ggm-user-info">
                                        <span className="ggm-auto-nick">@{item.usuario.nickname}</span>
                                        <span className="ggm-auto-name">{item.usuario.nombre_real}</span>
                                    </div>
                                    {isEditing[pos] && (
                                        <button
                                            className="ggm-clear-btn"
                                            onClick={() => clearUser(pos)}
                                            title="Quitar usuario"
                                        >×</button>
                                    )}
                                </div>
                            )}

                            {/* PUNTOS INPUT (only 1-3) */}
                            {isTop3 && (
                                <div className="ggm-points-wrapper">
                                    <span className="ggm-label">PUNTOS GANADOS</span>
                                    <input
                                        className="ggm-points-input"
                                        type="text"
                                        value={item.puntos}
                                        onChange={(e) => handlePointsChange(pos, e.target.value)}
                                        placeholder="0"
                                        disabled={!isEditing[pos] || !item.usuario}
                                    />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* HISTORIAL SECTION */}
            <div className="ggm-historical-section">
                <div className="ggm-historical-header">
                    <span className="ggm-historical-icon">📚</span>
                    <div>
                        <h3 className="ggm-historical-title">Historial de Meses Registrados</h3>
                        <p className="ggm-historical-sub">Consulta o carga en el editor cualquier mes pasado o presente</p>
                    </div>
                </div>

                {loadingHistorial ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#8c96a3' }}>Cargando historial...</div>
                ) : Object.keys(historialAgrupado).length === 0 ? (
                    <div className="ggm-empty-historial">
                        No hay ganadores registrados en meses o años anteriores.
                    </div>
                ) : (
                    <div className="ggm-years-list">
                        {Object.keys(historialAgrupado)
                            .sort((a, b) => b - a)
                            .map(year => (
                                <div key={year} className={`ggm-year-block ${expandedYears[year] ? 'expanded' : ''}`}>
                                    <div className="ggm-year-bar" onClick={() => toggleYear(year)}>
                                        <h4 className="ggm-year-number">{year}</h4>
                                        <span className="ggm-year-toggle">{expandedYears[year] ? '▲' : '▼'}</span>
                                    </div>

                                    {expandedYears[year] && (
                                        <div className="ggm-months-grid">
                                            {Object.keys(historialAgrupado[year])
                                                .sort((a, b) => b - a)
                                                .map(month => {
                                                    const ganadoresMes = historialAgrupado[year][month]
                                                    const isCurrentlyLoaded = Number(year) === selectedPeriod.year && (Number(month) + 1) === selectedPeriod.month
                                                    return (
                                                        <div key={`${year}-${month}`} className={`ggm-month-card ${isCurrentlyLoaded ? 'is-active-card' : ''}`}>
                                                            <div className="ggm-month-card-top">
                                                                <div className="ggm-month-title">
                                                                    {getMonthName(Number(month))}
                                                                    {isCurrentlyLoaded && <span className="ggm-active-chip">Activo en Editor</span>}
                                                                </div>
                                                                <button
                                                                    className="ggm-load-month-btn"
                                                                    onClick={() => loadHistoricalMonth(year, month)}
                                                                    title="Cargar este mes en las tarjetas superiores para editarlo"
                                                                >
                                                                    ✏️ Editar
                                                                </button>
                                                            </div>
                                                            <div className="ggm-month-winners-list">
                                                                {ganadoresMes.map(g => (
                                                                    <div key={g.posicion} className={`ggm-hist-winner pos-${g.posicion}`}>
                                                                        <div className="ggm-hist-pos">{g.posicion}º</div>
                                                                        <div className="ggm-hist-info">
                                                                            <span className="ggm-hist-nick">@{g.usuarios?.nickname}</span>
                                                                            {g.puntos && <span className="ggm-hist-pts">{g.puntos} pts</span>}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            }
                                        </div>
                                    )}
                                </div>
                            ))
                        }
                    </div>
                )}
            </div>

            {/* CONFIRM DIALOG */}
            {confirmDialogPos !== null && (
                <div className="ggm-overlay" onClick={() => !saving && setConfirmDialogPos(null)}>
                    <div className="ggm-dialog" onClick={e => e.stopPropagation()}>
                        <div className="ggm-dialog-icon">💾</div>
                        <h3 className="ggm-dialog-title">Confirmar {confirmDialogPos}º Lugar</h3>
                        <div className="ggm-dialog-body">
                            <p>
                                ¿Deseas guardar los cambios para el <strong>{confirmDialogPos}º Lugar</strong> del mes de <strong>{selectedMonthName} {selectedPeriod.year}</strong>?
                            </p>
                            <p style={{ fontSize: '0.82rem', color: '#00e5ff', marginTop: '6px' }}>
                                Se actualizará automáticamente en la pantalla de TV.
                            </p>
                        </div>
                        <div className="ggm-dialog-actions">
                            <button className="ggm-btn-cancel" onClick={() => setConfirmDialogPos(null)} disabled={saving}>Cancelar</button>
                            <button className="ggm-btn-confirm" onClick={handleSaveConfirm} disabled={saving}>
                                {saving ? 'Guardando...' : 'Sí, confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TOAST */}
            {toast && (
                <div className={`ggm-toast ggm-toast-${toast.type}`}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
                </div>
            )}
        </div>
    )
}

export default GestorGanadoresMensuales
