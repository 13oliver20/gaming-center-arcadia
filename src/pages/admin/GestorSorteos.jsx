import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import './GestorSorteos.css'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { getPeruDateStr, getPeruFormattedDate, getPeruDateParts } from '../../utils/peruTime'

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const GestorSorteos = () => {
    // Global Config
    const [config, setConfig] = useState({ is_active: true, dias_activos: [] })

    // Horarios & Historial
    const [horarios, setHorarios] = useState([])
    const [historial, setHistorial] = useState([])

    // UI states
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState(null)

    // Pagination
    const PAGE_SIZE = 10
    const [currentPage, setCurrentPage] = useState(1)

    // Search inputs keyed by horario ID
    const [searchTerms, setSearchTerms] = useState({})
    const [searchResults, setSearchResults] = useState({})

    // Selected winner per horario (to display the locked status in the UI)
    const [selectedWinners, setSelectedWinners] = useState({})

    // Confirmation Dialog
    const [confirmDialog, setConfirmDialog] = useState(null) // { sorteoId, usuario }
    const [confirmDeleteDialog, setConfirmDeleteDialog] = useState(null) // history item object
    const [confirmDeleteAllDialog, setConfirmDeleteAllDialog] = useState(false)
    const [confirmExportDialog, setConfirmExportDialog] = useState(false)
    const [confirmImportDialog, setConfirmImportDialog] = useState(null) // { fileName, rows (raw parsed) }
    // Edit history row
    const [editDialog, setEditDialog] = useState(null)         // { ...historialItem, editFecha, editHora, editPremio, editUsuarioSearch, editUsuarioResult }
    const [confirmSaveEditDialog, setConfirmSaveEditDialog] = useState(false)
    const [editSearchResults, setEditSearchResults] = useState([])
    const [expandedStatsYears, setExpandedStatsYears] = useState({}) // Para el acordeón de años

    // Ref for the hidden file input
    const importInputRef = useRef(null)

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    const channelRef = useRef(null)

    const broadcastSorteosChange = () => {
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'update_sorteos',
                payload: { timestamp: Date.now() }
            }).catch(err => console.error("Broadcast error:", err))
        }
    }

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

    const fetchData = async () => {
        setLoading(true)
        try {
            // 1. Fetch Config
            const { data: cData, error: cErr } = await supabase
                .from('sorteos_configuracion')
                .select('*')
                .eq('id', '00000000-0000-0000-0000-000000000001')
                .single()
            if (cErr) throw cErr
            if (cData) setConfig({ is_active: cData.is_active, dias_activos: cData.dias_activos || [] })

            // 2. Fetch Horarios (con predeterminados 1:00 PM y 5:00 PM)
            const { data: hData, error: hErr } = await supabase
                .from('sorteos_horarios')
                .select('*')
                .order('orden', { ascending: true })
            if (hErr) throw hErr

            let currentHorarios = hData || []
            if (currentHorarios.length === 0) {
                // Sorteos predeterminados: Sorteo 1 a la 1:00 PM y Sorteo 2 a las 5:00 PM
                const defaultHorarios = [
                    { hora: '1:00 PM', orden: 1 },
                    { hora: '5:00 PM', orden: 2 }
                ]
                const { data: seeded, error: seedErr } = await supabase
                    .from('sorteos_horarios')
                    .insert(defaultHorarios)
                    .select()
                    .order('orden', { ascending: true })
                if (!seedErr && seeded && seeded.length > 0) {
                    currentHorarios = seeded
                }
            }
            setHorarios(currentHorarios)

            // 3. Fetch Historial (join with usuarios)
            // Note: Since no strict FK is enforced by default in our setup to avoid name clashes, 
            // we have to fetch historial and then manually fetch users, OR rely on a view. 
            // We'll do two quick parallel fetches and zip them for simplicity.
            const { data: histData, error: histErr } = await supabase
                .from('sorteos_historial')
                .select('*')
                .order('created_at', { ascending: false })
            if (histErr) throw histErr

            if (histData && histData.length > 0) {
                const userIds = histData.map(h => h.usuario_id)
                const { data: uData } = await supabase
                    .from('usuarios')
                    .select('id, nombre_real, nickname')
                    .in('id', userIds)

                const userMap = {}
                if (uData) uData.forEach(u => userMap[u.id] = u)

                const fullHistorial = histData.map(h => ({
                    ...h,
                    usuario: userMap[h.usuario_id] || { nombre_real: 'Usuario Desconocido', nickname: 'deleted' }
                }))

                // Ordenar por fecha desc, luego por la hora del sorteo desc
                fullHistorial.sort((a, b) => {
                    if (a.fecha !== b.fecha) {
                        return b.fecha.localeCompare(a.fecha) // fecha desc
                    }

                    const hA = currentHorarios.find(x => x.id === a.sorteo_id)?.hora || '00:00 AM'
                    const hB = currentHorarios.find(x => x.id === b.sorteo_id)?.hora || '00:00 AM'

                    // Simple parse to 24h for comparison: "1:00 PM" -> "13:00"
                    const to24 = (hStr) => {
                        const match = hStr.match(/(\d+):(\d+)\s*(AM|PM)/i)
                        if (!match) return hStr
                        let h = parseInt(match[1], 10)
                        const m = match[2]
                        const ampm = match[3].toUpperCase()
                        if (ampm === 'PM' && h !== 12) h += 12
                        if (ampm === 'AM' && h === 12) h = 0
                        return `${h.toString().padStart(2, '0')}:${m}`
                    }

                    return to24(hB).localeCompare(to24(hA)) // hora desc
                })

                setHistorial(fullHistorial)

                // Get winners for today to lock inputs
                const today = getPeruDateStr()
                const todayWinners = {}
                fullHistorial.forEach(h => {
                    if (h.fecha === today) {
                        todayWinners[h.sorteo_id] = h.usuario
                    }
                })
                setSelectedWinners(todayWinners)

            } else {
                setHistorial([])
                setSelectedWinners({})
            }

        } catch (error) {
            console.error(error)
            showToast('❌ Error al cargar datos', 'error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()

        // Monitoreo a las 00:00 (Perú GMT-5) para restablecer automáticamente los espacios del nuevo día
        let lastDate = getPeruDateStr()
        const midnightTimer = setInterval(() => {
            const currentDate = getPeruDateStr()
            if (currentDate !== lastDate) {
                lastDate = currentDate
                fetchData()
            }
        }, 5000)

        return () => clearInterval(midnightTimer)
    }, [])

    // --- Config Actions ---

    const toggleDia = async (dia) => {
        let newDias = [...config.dias_activos]
        if (newDias.includes(dia)) {
            newDias = newDias.filter(d => d !== dia)
        } else {
            // Keep correct order by sorting against the master array
            newDias.push(dia)
            newDias.sort((a, b) => DIAS_SEMANA.indexOf(a) - DIAS_SEMANA.indexOf(b))
        }

        const newConfigState = { ...config, dias_activos: newDias }
        setConfig(newConfigState)

        // Emitir broadcast para fluidez inmediata
        if (channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'update_config',
                payload: newConfigState
            }).catch(err => console.error("Broadcast error:", err))
        }
        broadcastSorteosChange()

        await supabase.from('sorteos_configuracion').update({ dias_activos: newDias }).eq('id', '00000000-0000-0000-0000-000000000001')
    }

    // --- Horarios Actions ---
    const addHorario = async () => {
        const newOrden = horarios.length > 0 ? Math.max(...horarios.map(h => h.orden)) + 1 : 1
        let defaultHora = '8:00 PM'
        if (newOrden === 1) defaultHora = '1:00 PM'
        else if (newOrden === 2) defaultHora = '5:00 PM'
        const newH = { hora: defaultHora, orden: newOrden }

        const { data, error } = await supabase.from('sorteos_horarios').insert([newH]).select()
        if (error) {
            showToast('Error al agregar.', 'error')
        } else if (data) {
            setHorarios([...horarios, data[0]])
            broadcastSorteosChange()
        }
    }

    const updateHora = async (id, nuevaHora) => {
        setHorarios(horarios.map(h => h.id === id ? { ...h, hora: nuevaHora } : h))
        await supabase.from('sorteos_horarios').update({ hora: nuevaHora }).eq('id', id)
        broadcastSorteosChange()
    }

    // Helper: Ajustar hora en incrementos/decrementos de 30 mins
    const updateHoraInterval = (id, currentHoraStr, direction) => {
        // Parse current string like "12:00 PM"
        const match = currentHoraStr.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
        if (!match) return

        let h = parseInt(match[1], 10)
        let m = parseInt(match[2], 10)
        let ampm = match[3] ? match[3].toUpperCase() : 'AM'

        // Convert to 24h for math
        if (ampm === 'PM' && h !== 12) h += 12
        if (ampm === 'AM' && h === 12) h = 0

        // Change by 30 mins
        let totalMins = h * 60 + m
        totalMins += (direction === 'up' ? 30 : -30)

        // Wrap around 24h
        if (totalMins < 0) totalMins += 24 * 60
        if (totalMins >= 24 * 60) totalMins -= 24 * 60

        // Convert back to 12h
        let newH = Math.floor(totalMins / 60)
        const newM = totalMins % 60
        ampm = newH >= 12 ? 'PM' : 'AM'

        if (newH > 12) newH -= 12
        if (newH === 0) newH = 12

        const newHoraStr = `${newH}:${String(newM).padStart(2, '0')} ${ampm}`
        updateHora(id, newHoraStr)
    }

    const deleteHorario = async (id) => {
        try {
            const { error } = await supabase.from('sorteos_horarios').delete().eq('id', id)
            if (error) throw error

            setHorarios(prev => prev.filter(h => h.id !== id))
            showToast('🗑️ Sorteo eliminado.', 'success')
            broadcastSorteosChange()
        } catch (e) {
            console.error('Error al eliminar:', e)
            showToast('❌ Error al eliminar: ' + e.message, 'error')
        }
    }

    // --- Search Users & Outside Click ---
    const searchTimers = useRef({})
    const searchWrapRefs = useRef({})

    const searchUsers = async (sorteoId, text) => {
        const q = (text || '').trim()
        try {
            let query = supabase.from('usuarios').select('id, nombre_real, nickname')
            if (q) {
                query = query.or(`nombre_real.ilike.%${q}%,nickname.ilike.%${q}%`)
            } else {
                query = query.order('nombre_real', { ascending: true })
            }
            const { data, error } = await query.limit(6)
            if (!error && data) {
                setSearchResults(prev => ({ ...prev, [sorteoId]: data }))
            }
        } catch (err) {
            console.error('Error searching users:', err)
        }
    }

    const handleSearchChange = (sorteoId, text) => {
        setSearchTerms(prev => ({ ...prev, [sorteoId]: text }))
        if (searchTimers.current[sorteoId]) {
            clearTimeout(searchTimers.current[sorteoId])
        }
        searchTimers.current[sorteoId] = setTimeout(() => {
            searchUsers(sorteoId, text)
        }, 200)
    }

    const handleSearchFocus = (sorteoId) => {
        searchUsers(sorteoId, searchTerms[sorteoId] || '')
    }

    const clearSearch = (sorteoId) => {
        setSearchTerms(prev => ({ ...prev, [sorteoId]: '' }))
        setSearchResults(prev => ({ ...prev, [sorteoId]: [] }))
    }

    useEffect(() => {
        const handleOutsideClick = (e) => {
            const wraps = Object.values(searchWrapRefs.current).filter(Boolean)
            if (wraps.length > 0 && wraps.every(el => !el.contains(e.target))) {
                setSearchResults({})
            }
        }
        document.addEventListener('mousedown', handleOutsideClick)
        return () => document.removeEventListener('mousedown', handleOutsideClick)
    }, [])

    // --- Pick Winner ---
    const promptWinner = (sorteoId, usuario) => {
        setSearchResults(prev => ({ ...prev, [sorteoId]: [] }))
        setSearchTerms(prev => ({ ...prev, [sorteoId]: '' }))
        setConfirmDialog({ sorteoId, usuario })
    }

    const confirmWinner = async () => {
        if (!confirmDialog) return
        const { sorteoId, usuario } = confirmDialog
        try {
            const today = getPeruDateStr()

            // Eliminar registros previos de este sorteo hoy para evitar duplicados
            await supabase.from('sorteos_historial').delete().eq('sorteo_id', sorteoId).eq('fecha', today)

            const payload = {
                sorteo_id: sorteoId,
                usuario_id: usuario.id,
                fecha: today,
                premio: 'Sin Asignar'
            }

            const { error } = await supabase.from('sorteos_historial').insert([payload])
            if (error) throw error

            showToast(`✅ Ganador ${usuario.nombre_real} registrado.`)

            // Mark as selected locally
            setSelectedWinners(prev => ({ ...prev, [sorteoId]: usuario }))

            clearSearch(sorteoId)
            await fetchData() // Refresh history
            broadcastSorteosChange() // Actualización en tiempo real para /display

        } catch (e) {
            showToast('❌ Error al guardar ganador: ' + e.message, 'error')
        } finally {
            setConfirmDialog(null)
        }
    }

    // --- Reset Today's Winner for a Sorteo ---
    const clearTodayWinner = async (sorteoId) => {
        if (!window.confirm('¿Deseas quitar al ganador actual de este sorteo para hoy?')) return
        try {
            const today = getPeruDateStr()

            // Eliminar registro de la base de datos
            await supabase.from('sorteos_historial').delete().eq('sorteo_id', sorteoId).eq('fecha', today)

            const newWinners = { ...selectedWinners }
            delete newWinners[sorteoId]
            setSelectedWinners(newWinners)

            await fetchData()
            broadcastSorteosChange()
            showToast('🔄 Listo para elegir otro ganador.', 'success')

        } catch (e) {
            showToast('❌ Error al limpiar ganador', 'error')
        }
    }

    // --- Delete History ---
    const promptDeleteHistory = (historialItem) => {
        setConfirmDeleteDialog(historialItem)
    }

    const confirmDeleteHistory = async () => {
        if (!confirmDeleteDialog) return
        try {
            const { error } = await supabase.from('sorteos_historial').delete().eq('id', confirmDeleteDialog.id)
            if (error) throw error

            setHistorial(historial.filter(h => h.id !== confirmDeleteDialog.id))
            showToast('🗑️ Registro borrado exitosamente.', 'success')

            // Also if it happens to be today's winner, unlock the input automatically
            const today = getPeruDateStr()
            if (confirmDeleteDialog.fecha === today) {
                const newWinners = { ...selectedWinners }
                delete newWinners[confirmDeleteDialog.sorteo_id]
                setSelectedWinners(newWinners)
            }
            broadcastSorteosChange()
        } catch (e) {
            showToast('❌ Error al borrar el registro', 'error')
        } finally {
            setConfirmDeleteDialog(null)
        }
    }

    // --- Edit History Row ---
    const promptEditHistory = (h) => {
        const sorteoParent = horarios.find(hor => hor.id === h.sorteo_id)
        setEditDialog({
            ...h,
            editFecha: h.fecha,
            editHora: sorteoParent ? sorteoParent.hora : '',
            editPremio: h.premio || 'Sin Asignar',
            editUsuarioNombre: h.usuario.nombre_real,
            editUsuarioId: h.usuario_id,
        })
        setEditSearchResults([])
    }

    const handleEditUserSearch = async (text) => {
        setEditDialog(prev => ({ ...prev, editUsuarioNombre: text, editUsuarioId: null }))
        const q = text.trim()
        const { data } = await supabase
            .from('usuarios')
            .select('id, nombre_real, nickname')
            .or(q ? `nombre_real.ilike.%${q}%,nickname.ilike.%${q}%` : `nombre_real.neq.NULL`)
            .limit(8)
        setEditSearchResults(data || [])
    }

    const openEditUserSearch = async () => {
        // Load first users immediately when the user opens the search
        const { data } = await supabase
            .from('usuarios')
            .select('id, nombre_real, nickname')
            .order('nombre_real', { ascending: true })
            .limit(8)
        setEditSearchResults(data || [])
        setEditDialog(prev => ({ ...prev, editUsuarioNombre: '', editUsuarioId: null }))
    }

    const selectEditUser = (user) => {
        setEditDialog(prev => ({ ...prev, editUsuarioNombre: user.nombre_real, editUsuarioId: user.id }))
        setEditSearchResults([])
    }

    const confirmEditHistory = async () => {
        if (!editDialog) return
        try {
            // Find sorteo ID by hora
            const sorteo = horarios.find(h => h.hora === editDialog.editHora)
            const sorteoId = sorteo ? sorteo.id : editDialog.sorteo_id

            const updates = {
                fecha: editDialog.editFecha,
                sorteo_id: sorteoId,
                usuario_id: editDialog.editUsuarioId || editDialog.usuario_id,
                premio: editDialog.editPremio,
            }

            const { error } = await supabase.from('sorteos_historial').update(updates).eq('id', editDialog.id)
            if (error) throw error

            showToast('✅ Registro actualizado correctamente.', 'success')
            setEditDialog(null)
            setConfirmSaveEditDialog(false)
            fetchData()
            broadcastSorteosChange()
        } catch (e) {
            showToast('❌ Error al actualizar: ' + e.message, 'error')
            setConfirmSaveEditDialog(false)
        }
    }

    // --- Exportar Excel con celdas fecha/hora nativas ---
    const doExportarExcel = () => {
        const wsData = historial.map(h => {
            const sorteoParent = horarios.find(hor => hor.id === h.sorteo_id)
            const horaStr = sorteoParent ? sorteoParent.hora : 'N/A'  // e.g. "13:00 PM" or "13:00"

            // Build a JS Date for the fecha cell (date only, no time)
            const [y, m, d] = h.fecha.split('-').map(Number)
            const fechaDate = new Date(y, m - 1, d)

            // Build a fractional number for the hora cell (Excel time = fraction of day)
            const timeMatch = horaStr.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i)
            let horaFrac = 0
            if (timeMatch) {
                let hours = parseInt(timeMatch[1], 10)
                const mins = parseInt(timeMatch[2], 10)
                if (timeMatch[3]) {
                    const ampm = timeMatch[3].toUpperCase()
                    if (ampm === 'PM' && hours !== 12) hours += 12
                    if (ampm === 'AM' && hours === 12) hours = 0
                }
                horaFrac = (hours * 3600 + mins * 60) / 86400
            }

            return [
                { v: fechaDate, t: 'd', z: 'DD/MM/YYYY' },
                { v: horaFrac, t: 'n', z: 'HH:MM' },
                { v: h.usuario.nombre_real || '', t: 's' },
                { v: h.premio || 'Sin Asignar', t: 's' },
            ]
        })

        // Header row
        const header = [['Fecha', 'Hora del Sorteo', 'Usuario', 'Premio']]
        const ws = XLSX.utils.aoa_to_sheet([...header, ...wsData])

        // Set column widths
        ws['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 16 }]

        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Historial')
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

        const now = new Date()
        const peruStr = now.toLocaleString('sv-SE', { timeZone: 'America/Lima' })
        const [datePart, timePart] = peruStr.split(' ')
        const timeFormatted = timePart.slice(0, 5).replace(':', '-')
        const fileName = `Historial de Ganadores (${datePart} ${timeFormatted}).xlsx`
        saveAs(new Blob([wbout], { type: 'application/octet-stream' }), fileName)
        showToast('📥 Historial exportado exitosamente.')
        setConfirmExportDialog(false)
    }

    const exportarExcel = () => {
        if (historial.length === 0) {
            showToast('No hay datos para exportar.', 'error')
            return
        }
        setConfirmExportDialog(true)
    }

    // --- Importar Excel ---
    const importarExcel = (e) => {
        const file = e.target.files[0]
        if (!file) return
        e.target.value = ''
        const reader = new FileReader()
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target.result)
                // cellDates en false (default) permite leer fechas y horas como números enteros/decimales puros en vez de objectos Date que sufren desfases temporales o textos rotos.
                const workbook = XLSX.read(data, { type: 'array' })
                const sheet = workbook.Sheets[workbook.SheetNames[0]]
                // Dejar raw:true (por defecto) es clave para obtener el matemático epoch (e.g. 46083 o 0.5416)
                const rows = XLSX.utils.sheet_to_json(sheet)
                if (!rows || rows.length === 0) {
                    showToast('El archivo está vacío o no tiene datos válidos.', 'error')
                    return
                }
                setConfirmImportDialog({ fileName: file.name, rows })
            } catch (err) {
                showToast('❌ Error al leer el archivo: ' + err.message, 'error')
            }
        }
        reader.readAsArrayBuffer(file)
    }

    const doImportarExcel = async () => {
        if (!confirmImportDialog) return
        const { rows } = confirmImportDialog
        setConfirmImportDialog(null)
        let imported = 0
        let skipFecha = 0, skipUsuario = 0, skipHora = 0

        // --- Helper: String/Number formatted date → 'YYYY-MM-DD' ---
        const parseExcelDate = (val) => {
            if (!val && val !== 0) return null
            if (typeof val === 'number') {
                const epoch = new Date((val - 25569) * 86400000)
                const y = epoch.getUTCFullYear()
                const m = String(epoch.getUTCMonth() + 1).padStart(2, '0')
                const d = String(epoch.getUTCDate()).padStart(2, '0')
                return `${y}-${m}-${d}`
            }
            const s = String(val).trim()
            const dmy = s.match(/(?:^|\s)(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})(?:\s|$)/)
            if (dmy) {
                let y = dmy[3]
                if (y.length === 2) y = `20${y}`
                return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
            }
            const ymd = s.match(/(?:^|\s)(\d{2}|\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s|$)/)
            if (ymd) {
                let y = ymd[1]
                if (y.length === 2) y = `20${y}`
                return `${y}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
            }
            return null
        }

        // --- Helper: String/Number formatted time → '24h HH:MM' ---
        const parseExcelTime = (val) => {
            if (!val && val !== 0) return null
            if (typeof val === 'number') {
                const frac = val - Math.floor(val)
                const totalSec = Math.round(frac * 86400)
                const h = Math.floor(totalSec / 3600) % 24
                const m = Math.floor((totalSec % 3600) / 60)
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
            }
            const s = String(val).trim()
            const match = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?/i)
            if (match) {
                let h = parseInt(match[1], 10)
                const m = match[2]
                const ampm = match[3] ? match[3].toUpperCase() : null
                if (ampm === 'PM' && h !== 12) h += 12
                if (ampm === 'AM' && h === 12) h = 0
                return `${String(h).padStart(2, '0')}:${m}`
            }
            return null
        }

        // --- Match parsed 24h time against horarios (stored as "1:00 PM" or "13:00") ---
        const findSorteoByHora = (horaVal) => {
            const t24 = parseExcelTime(horaVal)
            if (!t24) return null
            const [hh, mm] = t24.split(':').map(Number)
            return horarios.find(hor => {
                if (!hor.hora) return false
                // Normalize DB hora: remove extra spaces and non-breaking spaces
                const ht = String(hor.hora).replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()

                // Direct 24h match
                if (ht === t24) return true

                // 12h AM/PM match
                const m12 = ht.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
                if (m12) {
                    let h2 = parseInt(m12[1], 10)
                    const ampm2 = m12[3] ? m12[3].toUpperCase() : null
                    if (ampm2 === 'PM' && h2 !== 12) h2 += 12
                    if (ampm2 === 'AM' && h2 === 12) h2 = 0
                    return h2 === hh && parseInt(m12[2], 10) === mm
                }
                return false
            }) || null
        }

        try {
            for (const row of rows) {
                const fecha = parseExcelDate(row['Fecha'])
                const horaSorteoRaw = row['Hora del Sorteo']
                const usuarioNick = row['Usuario'] ? String(row['Usuario']).trim() : null
                const premio = row['Premio'] ? String(row['Premio']).trim() : 'Sin Asignar'

                if (!fecha || !usuarioNick) {
                    console.warn('Omitido por fecha/usuario inválido:', row)
                    skipFecha++
                    continue
                }

                // User lookup: exact ilike on nickname OR nombre_real
                const { data: uData } = await supabase
                    .from('usuarios')
                    .select('id')
                    .or(`nickname.ilike.${usuarioNick},nombre_real.ilike.${usuarioNick}`)
                    .limit(1)

                if (!uData || uData.length === 0) {
                    console.warn('Omitido: Usuario no encontrado:', usuarioNick)
                    skipUsuario++
                    continue
                }
                const usuarioId = uData[0].id

                const sorteo = findSorteoByHora(horaSorteoRaw)
                if (!sorteo) {
                    console.warn(`Omitido: Hora "${horaSorteoRaw}" no coincide con los sorteos configurados (Parsed: ${parseExcelTime(horaSorteoRaw)}). Row:`, row)
                    skipHora++
                    continue
                }

                await supabase.from('sorteos_historial').insert([{
                    fecha,
                    sorteo_id: sorteo.id,
                    usuario_id: usuarioId,
                    premio
                }])
                imported++
            }

            const totalSkipped = skipFecha + skipUsuario + skipHora
            const detail = []
            if (skipFecha > 0) detail.push(`${skipFecha} sin fecha/usuario`)
            if (skipUsuario > 0) detail.push(`${skipUsuario} usuario desc.`)
            if (skipHora > 0) detail.push(`${skipHora} hora no asig.`)

            if (imported > 0) {
                let msg = `✅ ${imported} importados${totalSkipped > 0 ? `, ${totalSkipped} omitidos.` : '.'}`
                if (detail.length > 0) msg += ` Detalle: ${detail.join(' | ')}. Mira F12.`
                showToast(msg, totalSkipped > 0 ? 'error' : 'success')
            } else {
                showToast(`❌ No se importó nada. ${detail.join(' | ')}. Mira F12.`, 'error')
            }
            fetchData()
            broadcastSorteosChange()
        } catch (err) {
            showToast('❌ Error al importar: ' + err.message, 'error')
        }
    }

    // --- Eliminar Todo el Historial ---
    const eliminarTodoHistorial = async () => {
        try {
            const { error } = await supabase
                .from('sorteos_historial')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000') // delete all rows
            if (error) throw error
            setHistorial([])
            setSelectedWinners({})
            showToast('🗑️ Historial eliminado completamente.', 'success')
            broadcastSorteosChange()
        } catch (e) {
            showToast('❌ Error al eliminar historial: ' + e.message, 'error')
        } finally {
            setConfirmDeleteAllDialog(false)
        }
    }

    // --- Update Premio ---
    const updatePremio = async (id, nuevoPremio) => {
        setHistorial(prev => prev.map(h => h.id === id ? { ...h, premio: nuevoPremio } : h))
        try {
            const { error } = await supabase.from('sorteos_historial').update({ premio: nuevoPremio }).eq('id', id)
            if (error) throw error
            showToast('🎁 Premio actualizado exitosamente.', 'success')
        } catch (e) {
            showToast('❌ Error al actualizar premio', 'error')
        }
    }

    return (
        <div className="hq-sorteos-page">

            {/* Header & Config */}
            <div className="hs-header-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
                <h2 className="hs-title" style={{ margin: 0 }}>🏆 Gestor de Sorteos Diarios</h2>

                <div className="hs-days-selector">
                    {DIAS_SEMANA.map(dia => (
                        <button
                            key={dia}
                            className={`hs-day-btn ${config.dias_activos.includes(dia) ? 'active' : ''}`}
                            onClick={() => toggleDia(dia)}
                        >
                            {dia}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#00e5ff' }}>Cargando sorteos...</div>
            ) : (
                <>
                    {/* Sorteos Dinámicos */}
                    {horarios.map((h, i) => (
                        <div key={h.id} className="hs-sorteo-card">
                            <div className="hs-sorteo-header">
                                <span className="hs-sorteo-name">SORTEO #{i + 1}</span>
                                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                    <div className="hs-time-badge">
                                        <div className="hs-time-controls">
                                            <button
                                                className="hs-time-arrow"
                                                onClick={() => updateHoraInterval(h.id, h.hora, 'down')}
                                                title="Reducir 30 min"
                                            >◀</button>
                                            <div className="hs-time-display" style={{ width: '45px' }}>
                                                {h.hora.replace(' PM', '').replace(' AM', '')}
                                            </div>
                                            <button
                                                className="hs-time-arrow"
                                                onClick={() => updateHoraInterval(h.id, h.hora, 'up')}
                                                title="Aumentar 30 min"
                                            >▶</button>
                                        </div>
                                        <span
                                            onClick={() => updateHora(h.id, h.hora.includes('PM') ? h.hora.replace('PM', 'AM') : h.hora.replace('AM', 'PM'))}
                                            style={{ cursor: 'pointer', padding: '0 8px', display: 'flex', alignItems: 'center' }}
                                        >
                                            {h.hora.includes('PM') ? 'PM' : 'AM'}
                                        </span>
                                    </div>
                                    <button
                                        className="hs-del-btn"
                                        style={{ fontSize: '1.2rem', paddingBottom: '3px' }}
                                        onClick={() => deleteHorario(h.id)}
                                        title="Eliminar Sorteo"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>

                            <div className="hs-winner-search-wrap" ref={el => searchWrapRefs.current[h.id] = el}>
                                {selectedWinners[h.id] ? (
                                    <div className="hs-winner-locked" style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: 'rgba(0, 230, 118, 0.1)', border: '1px solid #00e676',
                                        borderRadius: '6px', padding: '12px 16px', color: '#fff'
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.85rem', color: '#00e676', marginRight: '10px' }}>✅ GANADOR:</span>
                                            <strong>{selectedWinners[h.id].nombre_real}</strong> <span style={{ color: '#00e5ff', fontSize: '0.85rem' }}>@{selectedWinners[h.id].nickname}</span>
                                        </div>
                                        <button
                                            onClick={() => clearTodayWinner(h.id)}
                                            style={{ background: 'transparent', border: 'none', color: '#ffd700', cursor: 'pointer', display: 'flex', gap: '5px', alignItems: 'center', fontSize: '0.85rem' }}
                                        >
                                            🔄 Cambiar
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            className="hs-winner-input"
                                            type="text"
                                            placeholder={`Seleccionar Ganador Sorteo #${i + 1}...`}
                                            value={searchTerms[h.id] || ''}
                                            onChange={(e) => handleSearchChange(h.id, e.target.value)}
                                            onFocus={() => handleSearchFocus(h.id)}
                                        />

                                        {/* Search Dropdown */}
                                        {searchResults[h.id] && searchResults[h.id].length > 0 && (
                                            <div className="hs-winner-dropdown">
                                                {searchResults[h.id].map(user => (
                                                    <div
                                                        key={user.id}
                                                        className="hs-dropdown-item"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => promptWinner(h.id, user)}
                                                    >
                                                        <span className="hs-dropdown-name">{user.nombre_real}</span>
                                                        <span className="hs-dropdown-nick">@{user.nickname}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}

                    <button className="hs-add-btn" onClick={addHorario}>
                        + AGREGAR NUEVO SORTEO
                    </button>

                    {/* Historial Table */}
                    <div className="hs-section-title">
                        <span>👥 Historial de Ganadores</span>
                        <span style={{ fontSize: '0.85rem' }}>Total: {historial.length}</span>
                    </div>

                    {/* Action Buttons */}
                    <div className="hs-historial-actions">
                        <div className="hs-historial-actions-left">
                            <button className="hs-action-btn hs-btn-import" onClick={() => importInputRef.current?.click()}>
                                📤 Importar Excel
                            </button>
                            <button className="hs-action-btn hs-btn-export" onClick={exportarExcel}>
                                📥 Exportar .xlsx
                            </button>
                        </div>
                        <button className="hs-action-btn hs-btn-delete-all" onClick={() => setConfirmDeleteAllDialog(true)}>
                            🗑️ Eliminar Todo
                        </button>
                    </div>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        style={{ display: 'none' }}
                        onChange={importarExcel}
                    />

                    <table className="hs-history-table">
                        <thead>
                            <tr>
                                <th>FECHA / DÍA</th>
                                <th>SORTEO HORA</th>
                                <th>GANADOR</th>
                                <th>PREMIO</th>
                                <th>ACCIONES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const totalPages = Math.max(1, Math.ceil(historial.length / PAGE_SIZE))
                                const safePage = Math.min(currentPage, totalPages)
                                const pageSlice = historial.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

                                if (pageSlice.length === 0) return (
                                    <tr><td colSpan={5} className="hs-td-empty">No hay historial de ganadores aún.</td></tr>
                                )

                                return pageSlice.map((h) => {
                                    const sorteoParent = horarios.find(hor => hor.id === h.sorteo_id)
                                    const horaSorteo = sorteoParent ? sorteoParent.hora : 'N/A'
                                    return (
                                        <tr key={h.id}>
                                            <td>{h.fecha}</td>
                                            <td style={{ color: '#a78bfa' }}>{horaSorteo}</td>
                                            <td>
                                                <strong>{h.usuario.nombre_real}</strong>
                                                <br />
                                                <span style={{ color: '#00e5ff', fontSize: '0.8rem' }}>@{h.usuario.nickname}</span>
                                            </td>
                                            <td>
                                                <select
                                                    value={h.premio || 'Sin Asignar'}
                                                    onChange={(e) => updatePremio(h.id, e.target.value)}
                                                    style={{
                                                        background: '#111',
                                                        color: '#fff',
                                                        border: '1px solid #333',
                                                        borderRadius: '4px',
                                                        padding: '5px',
                                                        fontSize: '0.85rem'
                                                    }}
                                                >
                                                    <option value="Sin Asignar">Sin Asignar</option>
                                                    <option value="Gaseosa">Gaseosa</option>
                                                    <option value="Helado">Helado</option>
                                                    <option value="Galleta">Galleta</option>
                                                    <option value="No recogio">No recogió</option>
                                                </select>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
                                                    <button className="hs-edit-btn" onClick={() => promptEditHistory(h)} title="Editar registro">✏️</button>
                                                    <button className="hs-del-btn" onClick={() => promptDeleteHistory(h)} title="Eliminar registro">✕</button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            })()}
                        </tbody>
                    </table>

                    {/* Pagination Controls */}
                    {historial.length > PAGE_SIZE && (() => {
                        const totalPages = Math.ceil(historial.length / PAGE_SIZE)
                        const safePage = Math.min(currentPage, totalPages)
                        const from = (safePage - 1) * PAGE_SIZE + 1
                        const to = Math.min(safePage * PAGE_SIZE, historial.length)

                        // Build page number windows: always show first, last, current ±2
                        const pages = []
                        for (let p = 1; p <= totalPages; p++) {
                            if (p === 1 || p === totalPages || (p >= safePage - 2 && p <= safePage + 2)) {
                                pages.push(p)
                            }
                        }
                        // Insert ellipsis markers
                        const withEllipsis = []
                        pages.forEach((p, i) => {
                            if (i > 0 && p - pages[i - 1] > 1) withEllipsis.push('...')
                            withEllipsis.push(p)
                        })

                        return (
                            <div className="hs-pagination">
                                <span className="hs-pagination-info">
                                    Mostrando {from}–{to} de {historial.length}
                                </span>
                                <div className="hs-pagination-controls">
                                    <button
                                        className="hs-page-btn hs-page-nav"
                                        onClick={() => setCurrentPage(1)}
                                        disabled={safePage === 1}
                                        title="Primera página"
                                    >«</button>
                                    <button
                                        className="hs-page-btn hs-page-nav"
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={safePage === 1}
                                        title="Página anterior"
                                    >‹</button>

                                    {withEllipsis.map((p, i) =>
                                        p === '...' ? (
                                            <span key={`dots-${i}`} className="hs-page-dots">…</span>
                                        ) : (
                                            <button
                                                key={p}
                                                className={`hs-page-btn ${p === safePage ? 'active' : ''}`}
                                                onClick={() => setCurrentPage(p)}
                                            >{p}</button>
                                        )
                                    )}

                                    <button
                                        className="hs-page-btn hs-page-nav"
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={safePage === totalPages}
                                        title="Página siguiente"
                                    >›</button>
                                    <button
                                        className="hs-page-btn hs-page-nav"
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={safePage === totalPages}
                                        title="Última página"
                                    >»</button>
                                </div>
                            </div>
                        )
                    })()}

                    {/* Monthly Stats */}
                    {(() => {
                        const EXCLUDED = ['Sin Asignar', 'No recogio']
                        const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
                        const PREMIO_ICONS = { 'Gaseosa': '🥤', 'Helado': '🍦', 'Galleta': '🍪', 'Sin Asignar': '❓', 'No recogio': '📦' }
                        const PREMIO_COLORS = { 'Gaseosa': '#00e5ff', 'Helado': '#a78bfa', 'Galleta': '#ffd700' }

                        // Group ALL prizes by YEAR then by MONTH
                        const byYear = {}
                        historial.forEach(h => {
                            const [year, month] = h.fecha.split('-')
                            if (!byYear[year]) byYear[year] = {}
                            if (!byYear[year][month]) byYear[year][month] = { year, month, premios: {}, extras: {}, usuarios: {} }

                            if (EXCLUDED.includes(h.premio)) {
                                byYear[year][month].extras[h.premio] = (byYear[year][month].extras[h.premio] || 0) + 1
                            } else {
                                byYear[year][month].premios[h.premio] = (byYear[year][month].premios[h.premio] || 0) + 1

                                // Count valid prizes per user
                                if (h.usuario && h.usuario.id) {
                                    const uid = h.usuario.id
                                    if (!byYear[year][month].usuarios[uid]) {
                                        byYear[year][month].usuarios[uid] = { ...h.usuario, count: 0 }
                                    }
                                    byYear[year][month].usuarios[uid].count += 1
                                }
                            }
                        })

                        const yearKeys = Object.keys(byYear).sort((a, b) => b - a)

                        // Open latest year by default if we haven't touched the state
                        if (yearKeys.length > 0 && Object.keys(expandedStatsYears).length === 0) {
                            setExpandedStatsYears({ [yearKeys[0]]: true })
                        }

                        if (yearKeys.length === 0) return (
                            <div className="hs-stats-box">
                                <h3>🏆 Estadísticas Mensuales de Premios</h3>
                                <p>No hay premios asignados aún.</p>
                            </div>
                        )

                        const toggleStatsYear = (y) => {
                            setExpandedStatsYears(prev => ({ ...prev, [y]: !prev[y] }))
                        }

                        return (
                            <div className="hs-stats-section hs-stats-acordeon">
                                <h3 className="hs-stats-main-title">🏆 Estadísticas Mensuales de Premios</h3>

                                <div className="hs-years-list">
                                    {yearKeys.map(year => {
                                        const isExpanded = expandedStatsYears[year]
                                        const monthKeys = Object.keys(byYear[year]).sort((a, b) => b - a)

                                        return (
                                            <div key={year} className={`hs-year-block ${isExpanded ? 'expanded' : ''}`}>
                                                <div className="hs-year-bar" onClick={() => toggleStatsYear(year)}>
                                                    <h4 className="hs-year-number">{year}</h4>
                                                    <span className="hs-year-toggle">{isExpanded ? '▲' : '▼'}</span>
                                                </div>

                                                {isExpanded && (
                                                    <div className="hs-stats-grid">
                                                        {monthKeys.map(month => {
                                                            const dataMonth = byYear[year][month]
                                                            const mesNombre = MESES[parseInt(month, 10) - 1]
                                                            const total = Object.values(dataMonth.premios).reduce((a, b) => a + b, 0)
                                                            const sortedPremios = Object.entries(dataMonth.premios).sort((a, b) => b[1] - a[1])
                                                            const sortedExtras = Object.entries(dataMonth.extras).sort((a, b) => b[1] - a[1])

                                                            return (
                                                                <div key={`${year}-${month}`} className="hs-stats-card">
                                                                    <div className="hs-stats-card-header">
                                                                        <span className="hs-stats-month">{mesNombre} {year}</span>
                                                                        <span className="hs-stats-total">{total} premios</span>
                                                                    </div>
                                                                    <div className="hs-stats-rows">
                                                                        {/* Counted prizes */}
                                                                        {sortedPremios.map(([premio, count]) => {
                                                                            const pct = total > 0 ? Math.round((count / total) * 100) : 0
                                                                            const color = PREMIO_COLORS[premio] || '#fff'
                                                                            return (
                                                                                <div key={premio} className="hs-stats-row">
                                                                                    <div className="hs-stats-row-label">
                                                                                        <span>{PREMIO_ICONS[premio] || '🎁'} {premio}</span>
                                                                                        <span className="hs-stats-row-count">{count}</span>
                                                                                    </div>
                                                                                    <div className="hs-stats-bar-bg">
                                                                                        <div className="hs-stats-bar-fill" style={{ width: `${pct}%`, background: color }} />
                                                                                    </div>
                                                                                </div>
                                                                            )
                                                                        })}

                                                                        {/* Extras */}
                                                                        {sortedExtras.length > 0 && (
                                                                            <>
                                                                                <div className="hs-stats-divider" />
                                                                                {sortedExtras.map(([premio, count]) => (
                                                                                    <div key={premio} className="hs-stats-row hs-stats-row-extra">
                                                                                        <div className="hs-stats-row-label">
                                                                                            <span>{PREMIO_ICONS[premio] || '❓'} {premio === 'No recogio' ? 'No recogió' : premio}</span>
                                                                                            <span className="hs-stats-row-count hs-stats-row-count-dim">{count}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </>
                                                                        )}

                                                                        {/* Top 5 Ganadores */}
                                                                        {(() => {
                                                                            const topUsers = Object.values(dataMonth.usuarios)
                                                                            if (!topUsers) return null;
                                                                            const validUsers = topUsers.sort((a, b) => b.count - a.count).slice(0, 5)

                                                                            if (validUsers.length === 0) return null

                                                                            return (
                                                                                <>
                                                                                    <div className="hs-stats-divider" style={{ margin: '15px 0' }} />
                                                                                    <div className="hs-stats-row-label" style={{ marginBottom: '10px', color: '#ffd700', fontSize: '0.85rem', fontWeight: 600 }}>
                                                                                        👑 Top 5 Ganadores del Mes:
                                                                                    </div>
                                                                                    {validUsers.map((u, i) => (
                                                                                        <div key={u.id} className="hs-stats-row hs-stats-row-extra" style={{ justifyContent: 'space-between', padding: '6px 0' }}>
                                                                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                                                <span style={{ marginRight: '8px', color: '#ffb300', fontWeight: 'bold' }}>{i + 1}.</span>
                                                                                                <span style={{ color: '#fff', fontSize: '0.9rem' }}>
                                                                                                    {u.nombre_real} <span style={{ color: '#00e5ff', fontSize: '0.75rem' }}>@{u.nickname}</span>
                                                                                                </span>
                                                                                            </div>
                                                                                            <span className="hs-stats-row-count" style={{ color: '#00e676' }}>
                                                                                                {u.count} <span style={{ fontSize: '0.7rem', color: '#8c96a3' }}>premios</span>
                                                                                            </span>
                                                                                        </div>
                                                                                    ))}
                                                                                </>
                                                                            )
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })()}
                </>
            )
            }

            {/* Confirm Winner Dialog */}
            {
                confirmDialog && (
                    <div className="gu-overlay" onClick={() => setConfirmDialog(null)}>
                        <div className="gu-dialog" onClick={e => e.stopPropagation()}>
                            <div className="gu-dialog-icon">🎁</div>
                            <h3 className="gu-dialog-title">Confirmar Ganador</h3>
                            <div className="gu-dialog-body">
                                <p>¿Estás seguro de declarar como ganador a este usuario?</p>
                                <div className="gu-dialog-preview">
                                    <span><strong>Nombre:</strong> {confirmDialog.usuario.nombre_real}</span>
                                    <span><strong>Nickname:</strong> @{confirmDialog.usuario.nickname}</span>
                                    <span style={{ color: '#00e5ff' }}>Sorteo seleccionado para hoy.</span>
                                </div>
                            </div>
                            <div className="gu-dialog-actions">
                                <button className="gu-btn-cancel" onClick={() => setConfirmDialog(null)}>Cancelar</button>
                                <button className="gu-btn-confirm" onClick={confirmWinner}>
                                    Confirmar Ganador
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Edit History Dialog */}
            {
                editDialog && (
                    <div className="gu-overlay" onClick={() => { setEditDialog(null); setEditSearchResults([]) }}>
                        <div className="gu-dialog gu-dialog-wide" onClick={e => e.stopPropagation()}>
                            <div className="gu-dialog-icon">✏️</div>
                            <h3 className="gu-dialog-title">Editar Registro</h3>
                            <div className="gu-dialog-body">
                                <div className="gu-edit-grid">
                                    <label className="gu-edit-label">Fecha</label>
                                    <input
                                        className="gu-edit-input"
                                        type="date"
                                        value={editDialog.editFecha}
                                        onChange={e => setEditDialog(prev => ({ ...prev, editFecha: e.target.value }))}
                                    />

                                    <label className="gu-edit-label">Hora del Sorteo</label>
                                    <select
                                        className="gu-edit-input"
                                        value={editDialog.editHora}
                                        onChange={e => setEditDialog(prev => ({ ...prev, editHora: e.target.value }))}
                                    >
                                        {horarios.map(h => (
                                            <option key={h.id} value={h.hora}>{h.hora}</option>
                                        ))}
                                    </select>

                                    <label className="gu-edit-label">Ganador</label>
                                    <div style={{ position: 'relative' }}>
                                        {editDialog.editUsuarioId ? (
                                            /* Confirmed user badge */
                                            <div className="gu-user-badge">
                                                <div className="gu-user-badge-info">
                                                    <span className="gu-user-badge-name">{editDialog.editUsuarioNombre}</span>
                                                    {editDialog.usuario?.nickname && (
                                                        <span className="gu-user-badge-nick">@{editDialog.usuario.nickname}</span>
                                                    )}
                                                </div>
                                                <button
                                                    className="gu-user-badge-clear"
                                                    onClick={openEditUserSearch}
                                                    title="Cambiar usuario"
                                                >×</button>
                                            </div>
                                        ) : (
                                            /* Search input */
                                            <input
                                                className="gu-edit-input gu-edit-search"
                                                type="text"
                                                autoFocus
                                                placeholder="Escribe nombre o @nickname..."
                                                value={editDialog.editUsuarioNombre}
                                                onChange={e => handleEditUserSearch(e.target.value)}
                                                onFocus={() => {
                                                    if (editSearchResults.length === 0) openEditUserSearch()
                                                }}
                                            />
                                        )}
                                        {!editDialog.editUsuarioId && editSearchResults.length > 0 && (
                                            <div className="hs-winner-dropdown" style={{ zIndex: 9999 }}>
                                                {editSearchResults.map(user => (
                                                    <div key={user.id} className="hs-dropdown-item" onClick={() => selectEditUser(user)}>
                                                        <span className="hs-dropdown-name">{user.nombre_real}</span>
                                                        <span className="hs-dropdown-nick">@{user.nickname}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <label className="gu-edit-label">Premio</label>
                                    <select
                                        className="gu-edit-input"
                                        value={editDialog.editPremio}
                                        onChange={e => setEditDialog(prev => ({ ...prev, editPremio: e.target.value }))}
                                    >
                                        <option value="Sin Asignar">Sin Asignar</option>
                                        <option value="Gaseosa">Gaseosa</option>
                                        <option value="Helado">Helado</option>
                                        <option value="Galleta">Galleta</option>
                                        <option value="No recogio">No recogió</option>
                                    </select>
                                </div>
                            </div>
                            <div className="gu-dialog-actions">
                                <button className="gu-btn-cancel" onClick={() => { setEditDialog(null); setEditSearchResults([]) }}>Cancelar</button>
                                <button className="gu-btn-confirm" onClick={() => setConfirmSaveEditDialog(true)}>
                                    Guardar Cambios
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Confirm Save Edit Dialog */}
            {
                confirmSaveEditDialog && editDialog && (
                    <div className="gu-overlay" onClick={() => setConfirmSaveEditDialog(false)}>
                        <div className="gu-dialog" onClick={e => e.stopPropagation()}>
                            <div className="gu-dialog-icon">✅</div>
                            <h3 className="gu-dialog-title">Confirmar Cambios</h3>
                            <div className="gu-dialog-body">
                                <p>¿Deseas guardar los siguientes cambios en el registro?</p>
                                <div className="gu-dialog-preview">
                                    <span><strong>Fecha:</strong> {editDialog.editFecha}</span>
                                    <span><strong>Hora:</strong> {editDialog.editHora}</span>
                                    <span><strong>Ganador:</strong> {editDialog.editUsuarioNombre}</span>
                                    <span><strong>Premio:</strong> {editDialog.editPremio}</span>
                                </div>
                            </div>
                            <div className="gu-dialog-actions">
                                <button className="gu-btn-cancel" onClick={() => setConfirmSaveEditDialog(false)}>Volver</button>
                                <button className="gu-btn-confirm" onClick={confirmEditHistory}>
                                    Sí, Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Confirm EXPORT Dialog */}
            {
                confirmExportDialog && (
                    <div className="gu-overlay" onClick={() => setConfirmExportDialog(false)}>
                        <div className="gu-dialog" onClick={e => e.stopPropagation()}>
                            <div className="gu-dialog-icon">📥</div>
                            <h3 className="gu-dialog-title">Exportar Historial</h3>
                            <div className="gu-dialog-body">
                                <p>¿Deseas exportar el historial completo de ganadores?</p>
                                <div className="gu-dialog-preview">
                                    <span><strong>Registros a exportar:</strong> {historial.length}</span>
                                    <span><strong>Archivo:</strong> historial_ganadores.xlsx</span>
                                </div>
                            </div>
                            <div className="gu-dialog-actions">
                                <button className="gu-btn-cancel" onClick={() => setConfirmExportDialog(false)}>Cancelar</button>
                                <button className="gu-btn-confirm" onClick={doExportarExcel}>
                                    Sí, Exportar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Confirm IMPORT Dialog */}
            {
                confirmImportDialog && (
                    <div className="gu-overlay" onClick={() => setConfirmImportDialog(null)}>
                        <div className="gu-dialog" onClick={e => e.stopPropagation()}>
                            <div className="gu-dialog-icon">📤</div>
                            <h3 className="gu-dialog-title">Importar desde Excel</h3>
                            <div className="gu-dialog-body">
                                <p>¿Deseas importar los ganadores desde este archivo?</p>
                                <div className="gu-dialog-preview">
                                    <span><strong>Archivo:</strong> {confirmImportDialog.fileName}</span>
                                    <span><strong>Filas detectadas:</strong> {confirmImportDialog.rows.length}</span>
                                    <span style={{ color: '#ffd700', fontSize: '0.82rem' }}>⚠️ Las filas con usuario u hora no reconocidos serán omitidas.</span>
                                </div>
                            </div>
                            <div className="gu-dialog-actions">
                                <button className="gu-btn-cancel" onClick={() => setConfirmImportDialog(null)}>Cancelar</button>
                                <button className="gu-btn-confirm" onClick={doImportarExcel}>
                                    Sí, Importar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Confirm Delete ALL History Dialog */}
            {
                confirmDeleteAllDialog && (
                    <div className="gu-overlay" onClick={() => setConfirmDeleteAllDialog(false)}>
                        <div className="gu-dialog" onClick={e => e.stopPropagation()}>
                            <div className="gu-dialog-icon" style={{ color: '#ff4444' }}>🗑️</div>
                            <h3 className="gu-dialog-title">Eliminar Todo el Historial</h3>
                            <div className="gu-dialog-body">
                                <p>¿Estás seguro de que deseas <strong>eliminar permanentemente</strong> todo el historial de ganadores?</p>
                                <p style={{ color: '#ff4444', fontSize: '0.85rem' }}>Esta acción no se puede deshacer.</p>
                            </div>
                            <div className="gu-dialog-actions">
                                <button className="gu-btn-cancel" onClick={() => setConfirmDeleteAllDialog(false)}>Cancelar</button>
                                <button className="gu-btn-confirm" style={{ background: '#ff4444', color: '#fff' }} onClick={eliminarTodoHistorial}>
                                    Sí, Eliminar Todo
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Confirm Delete History Dialog */}
            {
                confirmDeleteDialog && (
                    <div className="gu-overlay" onClick={() => setConfirmDeleteDialog(null)}>
                        <div className="gu-dialog" onClick={e => e.stopPropagation()}>
                            <div className="gu-dialog-icon" style={{ color: '#ff4444' }}>🗑️</div>
                            <h3 className="gu-dialog-title">Eliminar Historial</h3>
                            <div className="gu-dialog-body">
                                <p>¿Estás seguro de que deseas eliminar este registro del historial permanentemente?</p>
                                <div className="gu-dialog-preview">
                                    <span><strong>Ganador:</strong> {confirmDeleteDialog.usuario.nombre_real}</span>
                                    <span><strong>Fecha:</strong> {confirmDeleteDialog.fecha}</span>
                                </div>
                            </div>
                            <div className="gu-dialog-actions">
                                <button className="gu-btn-cancel" onClick={() => setConfirmDeleteDialog(null)}>Cancelar</button>
                                <button className="gu-btn-confirm" style={{ background: '#ff4444', color: '#fff' }} onClick={confirmDeleteHistory}>
                                    Sí, Eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                toast && (
                    <div className={`hq-toast ${toast.type}`}>
                        {toast.msg}
                    </div>
                )
            }
        </div >
    )
}

export default GestorSorteos
