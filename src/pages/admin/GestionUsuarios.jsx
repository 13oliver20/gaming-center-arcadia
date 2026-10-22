import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { supabase } from '../../supabaseClient'
import './GestionUsuarios.css'

const PAGE_SIZE = 10

const GestionUsuarios = () => {
    // Form state
    const [nombreReal, setNombreReal] = useState('')
    const [nickname, setNickname] = useState('')

    // Data & pagination
    const [usuarios, setUsuarios] = useState([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loadingList, setLoadingList] = useState(true)

    // Search
    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')

    // Dialogs
    const [addDialog, setAddDialog] = useState(false)
    const [editDialog, setEditDialog] = useState(null)  // { id, nombre_real, nickname }
    const [deleteDialog, setDeleteDialog] = useState(null)  // { id, nombre_real, nickname }

    // Edit form
    const [editNombre, setEditNombre] = useState('')
    const [editNick, setEditNick] = useState('')

    // Saving / toast
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)

    // Import / Export / Delete-all
    const [importing, setImporting] = useState(false)
    const [importDialog, setImportDialog] = useState(null) // holds selected file
    const [exportDialog, setExportDialog] = useState(false)
    const [deleteAllDialog, setDeleteAllDialog] = useState(false)
    const fileInputRef = useRef(null)

    // Debounce search 300ms
    useEffect(() => {
        const t = setTimeout(() => {
            setDebouncedSearch(searchTerm)
            setPage(1)
        }, 300)
        return () => clearTimeout(t)
    }, [searchTerm])

    useEffect(() => { fetchUsuarios() }, [page, debouncedSearch])

    const fetchUsuarios = async () => {
        setLoadingList(true)
        try {
            const from = (page - 1) * PAGE_SIZE
            const to = from + PAGE_SIZE - 1
            let query = supabase
                .from('usuarios')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .range(from, to)
            if (debouncedSearch.trim()) {
                query = query.or(
                    `nombre_real.ilike.%${debouncedSearch.trim()}%,nickname.ilike.%${debouncedSearch.trim()}%`
                )
            }
            const { data, count, error } = await query
            if (error) throw error
            setUsuarios(data || [])
            setTotal(count || 0)
        } catch (e) { console.error(e) }
        finally { setLoadingList(false) }
    }


    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    /* ---- IMPORT ---- */
    const handleImportClick = () => fileInputRef.current?.click()

    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return

        try {
            const buf = await file.arrayBuffer()
            const wb = XLSX.read(buf, { type: 'array' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            // rows as arrays — we start at 0 but skip if it looks like a header
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
            const payload = []

            // To preserve the Excel order in the UI (which sorts created_at DESC), 
            // we must ensure the first row gets the NEWEST timestamp. We subtract 1 second per row.
            const baseTime = Date.now()

            for (let i = 0; i < rows.length; i++) {
                const [nombreRaw, nickRaw] = rows[i]
                const nombre = String(nombreRaw || '').trim()
                const nick = String(nickRaw || '').trim()

                // Skip the row only if it's the very first row AND looks like the header
                if (i === 0 && (nombre.toLowerCase().includes('nombre') || nick.toLowerCase().includes('usuario') || nick.toLowerCase().includes('nick'))) {
                    continue;
                }

                if (nombre && nick) {
                    const staggeredTimestamp = new Date(baseTime - (i * 1000)).toISOString()
                    payload.push({ nombre_real: nombre, nickname: nick, created_at: staggeredTimestamp })
                }
            }

            setImportDialog({ file, payload })

        } catch (err) {
            showToast('❌ Error al leer el archivo: ' + err.message, 'error')
        }
    }

    const handleImportConfirm = async () => {
        if (!importDialog || !importDialog.payload) return
        setImporting(true)
        try {
            if (importDialog.payload.length === 0) {
                showToast('El archivo no tiene filas válidas.', 'error');
                return
            }
            // Inserción por lotes para evitar límites de tamaño de petición en archivos grandes
            const BATCH_SIZE = 500
            for (let i = 0; i < importDialog.payload.length; i += BATCH_SIZE) {
                const batch = importDialog.payload.slice(i, i + BATCH_SIZE)
                const { error } = await supabase.from('usuarios').insert(batch)
                if (error) throw error
            }
            showToast(`✅ ${importDialog.payload.length} usuario(s) importados.`, 'success')
            setPage(1); fetchUsuarios()
        } catch (err) { showToast('❌ Error al importar: ' + err.message, 'error') }
        finally {
            setImporting(false)
            setImportDialog(null)
        }
    }

    /* ---- EXPORT ---- */
    const handleExportConfirm = async () => {
        setSaving(true)
        try {
            const { data, error } = await supabase
                .from('usuarios')
                .select('nombre_real, nickname, created_at')
                .order('created_at', { ascending: false })
            if (error) throw error
            const rows = (data || []).map(u => ({
                'Nombre Real': u.nombre_real,
                'Nickname': u.nickname,
                'Fecha de Registro': u.created_at
                    ? new Date(u.created_at).toLocaleString('es-ES') : ''
            }))
            const ws = XLSX.utils.json_to_sheet(rows)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Usuarios')

            const now = new Date()
            const dateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD (safe)
            const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, '-') // HH-MM (safe)
            const fileName = `RegistroDeUsuarios - ${dateStr} ${timeStr}.xlsx`

            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
            const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' })

            saveAs(blob, fileName)

            showToast(`✅ Exportados ${rows.length} usuario(s).`, 'success')
        } catch (err) { showToast('❌ Error al exportar: ' + err.message, 'error') }
        finally {
            setSaving(false)
            setExportDialog(false)
        }
    }

    /* ---- DELETE ALL ---- */
    const handleDeleteAll = async () => {
        setSaving(true)
        try {
            // Limpiar dependencias en sorteos_historial y ganadores_mensuales para no violar Foreign Key Constraints
            await supabase.from('sorteos_historial').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            await supabase.from('ganadores_mensuales').delete().neq('id', '00000000-0000-0000-0000-000000000000')

            const { error } = await supabase.from('usuarios').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            if (error) throw error
            showToast('🗑️ Tabla eliminada correctamente.', 'success')
            setPage(1); fetchUsuarios()
        } catch (err) { showToast('❌ Error: ' + err.message, 'error') }
        finally { setSaving(false); setDeleteAllDialog(false) }
    }

    /* ---- ADD ---- */
    const handleAddClick = () => {
        if (!nombreReal.trim() || !nickname.trim())
            return showToast('Completa ambos campos.', 'error')
        setAddDialog(true)
    }

    const handleAddConfirm = async () => {
        setSaving(true)
        try {
            const { error } = await supabase.from('usuarios').insert([
                { nombre_real: nombreReal.trim(), nickname: nickname.trim() }
            ])
            if (error) throw error
            showToast('✅ Usuario guardado.', 'success')
            setNombreReal(''); setNickname('')
            setPage(1); fetchUsuarios()
        } catch (e) { showToast('❌ ' + e.message, 'error') }
        finally { setSaving(false); setAddDialog(false) }
    }

    /* ---- EDIT ---- */
    const openEdit = (u) => {
        setEditDialog(u)
        setEditNombre(u.nombre_real)
        setEditNick(u.nickname)
    }

    const handleEditConfirm = async () => {
        if (!editNombre.trim() || !editNick.trim())
            return showToast('Completa ambos campos.', 'error')
        setSaving(true)
        try {
            const { error } = await supabase
                .from('usuarios')
                .update({ nombre_real: editNombre.trim(), nickname: editNick.trim() })
                .eq('id', editDialog.id)
            if (error) throw error
            showToast('✅ Usuario actualizado.', 'success')
            fetchUsuarios()
        } catch (e) { showToast('❌ ' + e.message, 'error') }
        finally { setSaving(false); setEditDialog(null) }
    }

    /* ---- DELETE ---- */
    const handleDeleteConfirm = async () => {
        setSaving(true)
        try {
            // Limpiar registros relacionados antes de borrar el usuario
            await supabase.from('sorteos_historial').delete().eq('usuario_id', deleteDialog.id)
            await supabase.from('ganadores_mensuales').delete().eq('usuario_id', deleteDialog.id)

            const { error } = await supabase
                .from('usuarios')
                .delete()
                .eq('id', deleteDialog.id)
            if (error) throw error
            showToast('🗑️ Usuario eliminado.', 'success')
            if (usuarios.length === 1 && page > 1) setPage(p => p - 1)
            else fetchUsuarios()
        } catch (e) { showToast('❌ ' + e.message, 'error') }
        finally { setSaving(false); setDeleteDialog(null) }
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const fromIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
    const toIdx = Math.min(page * PAGE_SIZE, total)

    const formatDate = (iso) => {
        if (!iso) return '—'
        return new Date(iso).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })
    }

    return (
        <div className="gu-page">

            {/* ── HEADER ── */}
            <div className="gu-header">
                <span className="gu-header-icon">👥</span>
                <h2 className="gu-title">Gestión de Usuarios</h2>
                <span className="gu-count">{total} / 1000</span>
            </div>

            {/* ── FORM ── */}
            <div className="gu-form-row">
                <input className="gu-input" type="text" placeholder="Nombre Real"
                    value={nombreReal} onChange={e => setNombreReal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddClick()} />
                <input className="gu-input" type="text" placeholder="Nickname"
                    value={nickname} onChange={e => setNickname(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddClick()} />
                <button className="gu-add-btn" onClick={handleAddClick} title="Agregar usuario">+</button>
            </div>

            {/* ── SEARCH ── */}
            <div className="gu-search-bar">
                <span className="gu-search-icon">🔍</span>
                <input
                    className="gu-search-input"
                    type="text"
                    placeholder="Buscar por nombre o nickname…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                    <button className="gu-search-clear" onClick={() => setSearchTerm('')} title="Limpiar">
                        ✕
                    </button>
                )}
            </div>

            {/* ── TOOLBAR: Import / Export / Delete All ── */}
            <div className="gu-toolbar">
                {/* Hidden file input for Excel import */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xlsm"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                />
                <button className="gu-toolbar-btn import" onClick={handleImportClick} disabled={importing}>
                    {importing ? '⏳ Importando…' : '📥 Importar Excel'}
                </button>
                <button className="gu-toolbar-btn export" onClick={() => setExportDialog(true)}>
                    📤 Exportar .xlsx
                </button>
                <button className="gu-toolbar-btn danger" onClick={() => setDeleteAllDialog(true)}>
                    🗑️ Eliminar Todo
                </button>
            </div>

            {/* ── TABLE ── */}
            <div className="gu-table-wrap">
                <table className="gu-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Nombre Real</th>
                            <th>Nickname</th>
                            <th>Fecha de Registro</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loadingList ? (
                            <tr><td colSpan={5} className="gu-td-empty">Cargando…</td></tr>
                        ) : usuarios.length === 0 ? (
                            <tr><td colSpan={5} className="gu-td-empty">No hay usuarios registrados.</td></tr>
                        ) : usuarios.map((u, i) => (
                            <tr key={u.id}>
                                <td className="gu-td-num">{(page - 1) * PAGE_SIZE + i + 1}</td>
                                <td>{u.nombre_real}</td>
                                <td className="gu-td-nick">@{u.nickname}</td>
                                <td className="gu-td-date">{formatDate(u.created_at)}</td>
                                <td className="gu-td-actions">
                                    <button className="gu-icon-btn edit" title="Editar"
                                        onClick={() => openEdit(u)}>✏️</button>
                                    <button className="gu-icon-btn delete" title="Eliminar"
                                        onClick={() => setDeleteDialog(u)}>🗑️</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* ── PAGINATION ── */}
            {total > 0 && (
                <div className="gu-pagination-container">
                    <div className="gu-records-info">
                        Mostrando {fromIdx} a {toIdx} de {total} registros
                    </div>
                    {totalPages > 1 && (
                        <div className="gu-pagination">
                            <button className="gu-page-btn" disabled={page === 1}
                                onClick={() => setPage(1)}>« Primero</button>
                            <button className="gu-page-btn" disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}>‹ Ant</button>
                            <span className="gu-page-info">Pág {page} de {totalPages}</span>
                            <button className="gu-page-btn" disabled={page === totalPages}
                                onClick={() => setPage(p => p + 1)}>Sig ›</button>
                            <button className="gu-page-btn" disabled={page === totalPages}
                                onClick={() => setPage(totalPages)}>Último »</button>
                        </div>
                    )}
                </div>
            )}

            {/* ══════ DIALOGS ══════ */}

            {/* Add confirmation */}
            {addDialog && (
                <div className="gu-overlay" onClick={() => setAddDialog(false)}>
                    <div className="gu-dialog" onClick={e => e.stopPropagation()}>
                        <div className="gu-dialog-icon">💾</div>
                        <h3 className="gu-dialog-title">Confirmar guardado</h3>
                        <div className="gu-dialog-body">
                            <p>¿Deseas guardar el siguiente usuario?</p>
                            <div className="gu-dialog-preview">
                                <span><strong>Nombre:</strong> {nombreReal}</span>
                                <span><strong>Nickname:</strong> @{nickname}</span>
                            </div>
                        </div>
                        <div className="gu-dialog-actions">
                            <button className="gu-btn-cancel" onClick={() => setAddDialog(false)} disabled={saving}>Cancelar</button>
                            <button className="gu-btn-confirm" onClick={handleAddConfirm} disabled={saving}>
                                {saving ? 'Guardando…' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit dialog */}
            {editDialog && (
                <div className="gu-overlay" onClick={() => setEditDialog(null)}>
                    <div className="gu-dialog" onClick={e => e.stopPropagation()}>
                        <div className="gu-dialog-icon">✏️</div>
                        <h3 className="gu-dialog-title">Editar Usuario</h3>
                        <div className="gu-dialog-body edit-body">
                            <label>Nombre Real</label>
                            <input className="gu-input" type="text" value={editNombre}
                                onChange={e => setEditNombre(e.target.value)} />
                            <label>Nickname</label>
                            <input className="gu-input" type="text" value={editNick}
                                onChange={e => setEditNick(e.target.value)} />
                        </div>
                        <div className="gu-dialog-actions">
                            <button className="gu-btn-cancel" onClick={() => setEditDialog(null)} disabled={saving}>Cancelar</button>
                            <button className="gu-btn-confirm" onClick={handleEditConfirm} disabled={saving}>
                                {saving ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete dialog */}
            {deleteDialog && (
                <div className="gu-overlay" onClick={() => setDeleteDialog(null)}>
                    <div className="gu-dialog gu-dialog-delete" onClick={e => e.stopPropagation()}>
                        <div className="gu-dialog-icon">⚠️</div>
                        <h3 className="gu-dialog-title">Eliminar Usuario</h3>
                        <div className="gu-dialog-body">
                            <p>¿Estás seguro de que deseas eliminar a:</p>
                            <div className="gu-dialog-preview">
                                <span><strong>Nombre:</strong> {deleteDialog.nombre_real}</span>
                                <span><strong>Nickname:</strong> @{deleteDialog.nickname}</span>
                            </div>
                            <p className="gu-warn-text">Esta acción no se puede deshacer.</p>
                        </div>
                        <div className="gu-dialog-actions">
                            <button className="gu-btn-cancel" onClick={() => setDeleteDialog(null)} disabled={saving}>Cancelar</button>
                            <button className="gu-btn-danger" onClick={handleDeleteConfirm} disabled={saving}>
                                {saving ? 'Eliminando…' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Import Confirmation Dialog */}
            {importDialog && (
                <div className="gu-overlay" onClick={() => !importing && setImportDialog(null)}>
                    <div className="gu-dialog" onClick={e => e.stopPropagation()}>
                        <div className="gu-dialog-icon">📥</div>
                        <h3 className="gu-dialog-title">Confirmar Importación</h3>
                        <div className="gu-dialog-body">
                            <p>Se importará el siguiente archivo:</p>
                            <div className="gu-dialog-preview">
                                <span><strong>Archivo:</strong> {importDialog.file.name}</span>
                                <span><strong>Tamaño:</strong> {(importDialog.file.size / 1024).toFixed(1)} KB</span>
                                <span><strong>Registros encontrados:</strong> {importDialog.payload.length}</span>
                            </div>
                            <p className="gu-warn-text" style={{ color: '#00c8ff', margin: '12px 0 8px' }}>
                                Asegúrate de que las columnas sean "Nombre Real" y "Nickname".
                            </p>
                            <button className="gu-btn-cancel" style={{ alignSelf: 'center', fontSize: '0.8rem', padding: '6px 14px' }}
                                onClick={() => {
                                    const ws = XLSX.utils.json_to_sheet([{ 'Nombre Real': '', 'Nickname': '' }])
                                    const wb = XLSX.utils.book_new()
                                    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla')

                                    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
                                    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' })

                                    saveAs(blob, 'plantilla_usuarios.xlsx')
                                }}
                            >
                                📄 Descargar Plantilla
                            </button>
                        </div>
                        <div className="gu-dialog-actions">
                            <button className="gu-btn-cancel" onClick={() => setImportDialog(null)} disabled={importing}>Cancelar</button>
                            <button className="gu-btn-confirm" onClick={handleImportConfirm} disabled={importing}>
                                {importing ? 'Importando…' : 'Sí, importar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Export Confirmation Dialog */}
            {exportDialog && (
                <div className="gu-overlay" onClick={() => !saving && setExportDialog(false)}>
                    <div className="gu-dialog" onClick={e => e.stopPropagation()}>
                        <div className="gu-dialog-icon">📤</div>
                        <h3 className="gu-dialog-title">Exportar Usuarios</h3>
                        <div className="gu-dialog-body">
                            <p>¿Deseas descargar la lista completa de usuarios en formato Excel (.xlsx)?</p>
                            <div className="gu-dialog-preview">
                                <span><strong>Total de registros:</strong> {total}</span>
                            </div>
                        </div>
                        <div className="gu-dialog-actions">
                            <button className="gu-btn-cancel" onClick={() => setExportDialog(false)} disabled={saving}>Cancelar</button>
                            <button className="gu-btn-confirm" onClick={handleExportConfirm} disabled={saving}>
                                {saving ? 'Generando…' : 'Sí, exportar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete All Dialog */}
            {deleteAllDialog && (
                <div className="gu-overlay" onClick={() => !saving && setDeleteAllDialog(false)}>
                    <div className="gu-dialog gu-dialog-delete" onClick={e => e.stopPropagation()}>
                        <div className="gu-dialog-icon">🚨</div>
                        <h3 className="gu-dialog-title">Eliminar TODOS los Usuarios</h3>
                        <div className="gu-dialog-body">
                            <p>Estás a punto de vaciar completamente la tabla de usuarios.</p>
                            <div className="gu-dialog-preview">
                                <span><strong>Registros a eliminar:</strong> {total}</span>
                            </div>
                            <p className="gu-warn-text">¡Esta acción es IRREVERSIBLE! Se perderán todos los datos.</p>
                        </div>
                        <div className="gu-dialog-actions">
                            <button className="gu-btn-cancel" onClick={() => setDeleteAllDialog(false)} disabled={saving}>Cancelar</button>
                            <button className="gu-btn-danger" onClick={handleDeleteAll} disabled={saving}>
                                {saving ? 'Eliminando…' : 'Sí, eliminar TODO'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`gu-toast gu-toast-${toast.type}`}>{toast.msg}</div>
            )}
        </div>
    )
}

export default GestionUsuarios
