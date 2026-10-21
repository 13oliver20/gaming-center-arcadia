import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import './GestorGanadoresMensuales.css'

const GestorGanadoresMensuales = () => {
    // State for History
    const [historialAgrupado, setHistorialAgrupado] = useState({})
    const [expandedYears, setExpandedYears] = useState({})
    const [loadingHistorial, setLoadingHistorial] = useState(false)

    // Helper to format month number to string
    const getMonthName = (monthIndex) => {
        const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        return months[monthIndex]
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

    // Load initial data assuming table `ganadores_mensuales` might exist
    useEffect(() => {
        fetchGanadores()
        fetchHistorial()
    }, [])

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
                // Determine current month so we don't show it in "Historial"
                const now = new Date()
                const currentYear = now.getFullYear()
                const currentMonth = now.getMonth()

                const agrupado = {}

                data.forEach(item => {
                    const date = new Date(item.created_at)
                    const year = date.getFullYear()
                    const month = date.getMonth()

                    // Skip current month (they are in the top active section)
                    if (year === currentYear && month === currentMonth) return

                    if (!agrupado[year]) agrupado[year] = {}
                    if (!agrupado[year][month]) agrupado[year][month] = []

                    agrupado[year][month].push(item)
                })

                // Sort the arrays by position for safety
                Object.keys(agrupado).forEach(yr => {
                    Object.keys(agrupado[yr]).forEach(mo => {
                        agrupado[yr][mo].sort((a, b) => a.posicion - b.posicion)
                    })
                })

                setHistorialAgrupado(agrupado)

                // by default expand latest year
                const years = Object.keys(agrupado).sort((a, b) => b - a)
                if (years.length > 0) {
                    setExpandedYears({ [years[0]]: true })
                }
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

    const fetchGanadores = async () => {
        setLoadingDb(true)
        try {
            const now = new Date()
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

            // Check if table exists indirectly or just try selecting
            const { data, error } = await supabase
                .from('ganadores_mensuales')
                .select('posicion, puntos, usuario_id, usuarios ( id, nickname, nombre_real )')
                .gte('created_at', startOfMonth)
                .lte('created_at', endOfMonth)

            if (error) {
                // If the error code means table not found, we can silently fail or notify
                if (error.code === '42P01') {
                    console.log('La tabla ganadores_mensuales no existe aún. Mostrará panel vacío.')
                } else {
                    console.error('Error fetching ganadores:', error)
                }
                return
            }

            if (data && data.length > 0) {
                let initGanadores = [...ganadores]
                data.forEach(row => {
                    const idx = initGanadores.findIndex(g => g.pos === row.posicion)
                    if (idx !== -1) {
                        initGanadores[idx].usuario = row.usuarios
                        initGanadores[idx].puntos = row.puntos || ''
                    }
                })
                setGanadores(initGanadores)
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

    // Debounced search for autocomplete
    useEffect(() => {
        if (activeSearch === null) return

        const term = searchTerms[activeSearch]
        if (!term || term.trim().length === 0) {
            setSearchResults(prev => ({ ...prev, [activeSearch]: [] }))
            return
        }

        const timer = setTimeout(async () => {
            try {
                const { data, error } = await supabase
                    .from('usuarios')
                    .select('id, nickname, nombre_real')
                    .or(`nickname.ilike.%${term.trim()}%,nombre_real.ilike.%${term.trim()}%`)
                    .limit(5)

                if (error) throw error
                setSearchResults(prev => ({ ...prev, [activeSearch]: data || [] }))
            } catch (err) {
                console.error(err)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [searchTerms, activeSearch])

    const handleSearchChange = (pos, val) => {
        setSearchTerms(prev => ({ ...prev, [pos]: val }))
    }

    const selectUser = (pos, user) => {
        // Check if user is already selected somewhere else
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
        setActiveSearch(null) // close dropdown
        setSearchTerms(prev => ({ ...prev, [pos]: '' })) // clear search term
    }

    const clearUser = (pos) => {
        let newGanadores = [...ganadores]
        const idx = newGanadores.findIndex(g => g.pos === pos)
        if (idx !== -1) {
            newGanadores[idx].usuario = null
            newGanadores[idx].puntos = '' // clean points when clearing user
        }
        setGanadores(newGanadores)
    }

    const handlePointsChange = (pos, val) => {
        // Allow empty or numeric values
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
        if (!confirmDialogPos) return;
        setSaving(true)
        try {
            const targetData = ganadores.find(g => g.pos === confirmDialogPos)

            const now = new Date()
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

            // Upsert mechanism: delete old record for this pos ONLY for the current month, then insert
            const { error: delError } = await supabase
                .from('ganadores_mensuales')
                .delete()
                .eq('posicion', confirmDialogPos)
                .gte('created_at', startOfMonth)
                .lte('created_at', endOfMonth)

            if (delError && delError.code !== '42P01') {
                throw delError
            }

            if (targetData && targetData.usuario) {
                const { error: insError } = await supabase
                    .from('ganadores_mensuales')
                    .insert([{
                        posicion: targetData.pos,
                        usuario_id: targetData.usuario.id,
                        puntos: targetData.puntos || null
                    }])

                if (insError) throw insError
            }

            showToast(`✅ Cambios guardados para el ${confirmDialogPos}º Lugar.`, 'success')
            setIsEditing(prev => ({ ...prev, [confirmDialogPos]: false }))
            setConfirmDialogPos(null)

            // Emitir evento para actualizar en tiempo real la otra vista
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

    return (
        <div className="ggm-page">
            <div className="ggm-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="ggm-header-icon">🏅</span>
                    <h2 className="ggm-title" style={{ margin: 0 }}>Gestor de Ganadores Mensuales</h2>
                </div>
            </div>

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
                                        placeholder="Buscar usuario..."
                                        value={searchTerms[pos]}
                                        onChange={(e) => handleSearchChange(pos, e.target.value)}
                                        onFocus={() => isEditing[pos] && setActiveSearch(pos)}
                                        disabled={!isEditing[pos]}
                                    />
                                    {activeSearch === pos && searchResults[pos]?.length > 0 && (
                                        <div className="ggm-autocomplete-dropdown">
                                            {searchResults[pos].map(u => (
                                                <div
                                                    key={u.id}
                                                    className="ggm-autocomplete-item"
                                                    onClick={() => selectUser(pos, u)}
                                                >
                                                    <span className="ggm-auto-nick">@{u.nickname}</span>
                                                    <span className="ggm-auto-name">{u.nombre_real}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {activeSearch === pos && searchTerms[pos] && searchResults[pos]?.length === 0 && (
                                        <div className="ggm-autocomplete-dropdown" style={{ padding: '10px 12px', color: '#8c96a3', fontSize: '0.85rem' }}>
                                            No se encontraron usuarios
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
                                        type="text" // uses text but validated to be numbers
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
                    <h3 className="ggm-historical-title">Historial de Meses Anteriores</h3>
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
                            .sort((a, b) => b - a) // Descending years
                            .map(year => (
                                <div key={year} className={`ggm-year-block ${expandedYears[year] ? 'expanded' : ''}`}>
                                    <div className="ggm-year-bar" onClick={() => toggleYear(year)}>
                                        <h4 className="ggm-year-number">{year}</h4>
                                        <span className="ggm-year-toggle">{expandedYears[year] ? '▲' : '▼'}</span>
                                    </div>

                                    {expandedYears[year] && (
                                        <div className="ggm-months-grid">
                                            {Object.keys(historialAgrupado[year])
                                                .sort((a, b) => b - a) // Descending months
                                                .map(month => {
                                                    const ganadoresMes = historialAgrupado[year][month]
                                                    return (
                                                        <div key={`${year}-${month}`} className="ggm-month-card">
                                                            <div className="ggm-month-title">{getMonthName(Number(month))}</div>
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
                        <div className="ggm-dialog-icon">✏️</div>
                        <h3 className="ggm-dialog-title">Confirmar {confirmDialogPos}º Lugar</h3>
                        <div className="ggm-dialog-body">
                            <p>¿Estás seguro de que deseas guardar los cambios realizados para el <strong>{confirmDialogPos}º Lugar</strong> de este mes?</p>
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
