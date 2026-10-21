import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import './GestorAnuncios.css'

const FONTS = [
    { label: 'Básica', value: 'Inter, sans-serif' },
    { label: 'Elegante', value: 'Georgia, serif' },
    { label: 'Código', value: "'Courier New', monospace" },
    { label: 'Cyber', value: "'Orbitron', sans-serif" },
    { label: 'Manuscrita', value: "'Dancing Script', cursive" },
]

const COLORS = [
    { label: 'Blanco', value: '#ffffff' },
    { label: 'Cyan', value: '#00e5ff' },
    { label: 'Amarillo', value: '#ffd600' },
    { label: 'Rosa Neón', value: '#ff4eb8' },
    { label: 'Verde', value: '#00e676' },
    { label: 'Naranja', value: '#ff6d00' },
    { label: 'Violeta', value: '#d500f9' },
]

const ICONS = ['📢', 'ℹ️', '⚠️', '🎮', '⭐', '🔥', '🎯', '🏆', '💥', '🎁']

const DEFAULT_STYLE = {
    texto: '',
    font: 'Inter, sans-serif',
    size: 1.0,
    icon: '📢',
    color: '#ffffff',
    pos_x: 0,
    pos_y: 0,
    activo: true,
    interactivo: false,
    imagenes: [],
}

const GestorAnuncios = () => {
    const [anuncios, setAnuncios] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(null)
    const [toast, setToast] = useState(null)
    const [confirmSave, setConfirmSave] = useState(null)
    const [confirmDelete, setConfirmDelete] = useState(null)
    const [confirmAdd, setConfirmAdd] = useState(false)
    const [expandedId, setExpandedId] = useState(null)
    const broadcastRef = useRef(null)

    // ── Drag-to-reorder state ─────────────────────────────────────────────────
    const imgDragSrc   = useRef(null)          // { anuncioId, idx }
    const [imgDragOver, setImgDragOver] = useState(null)   // { anuncioId, idx }
    const [dropZoneActive, setDropZoneActive] = useState(null) // anuncioId


    const MAX_CHARS = 300

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const fetchAnuncios = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('anuncios')
                .select('*')
                .order('updated_at', { ascending: true })
            if (error) throw error
            setAnuncios((data || []).map(a => ({
                ...DEFAULT_STYLE,
                ...a,
                imagenes: Array.isArray(a.imagenes) ? a.imagenes : [],
                interactivo: a.interactivo ?? false,
                _draft: {
                    texto: a.texto ?? '',
                    font: a.font ?? DEFAULT_STYLE.font,
                    size: a.size ?? DEFAULT_STYLE.size,
                    icon: a.icon ?? DEFAULT_STYLE.icon,
                    color: a.color ?? DEFAULT_STYLE.color,
                    pos_x: a.pos_x ?? DEFAULT_STYLE.pos_x,
                    pos_y: a.pos_y ?? DEFAULT_STYLE.pos_y,
                },
                _changed: false,
                _uploadingImg: false,
            })))
        } catch (e) {
            console.error(e)
            showToast('❌ Error al cargar: ' + e.message, 'error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchAnuncios() }, [])

    useEffect(() => {
        const channel = supabase.channel('anuncios-broadcast').subscribe()
        broadcastRef.current = channel
        return () => supabase.removeChannel(channel)
    }, [])

    const notifyDisplay = () => {
        broadcastRef.current?.send({
            type: 'broadcast',
            event: 'anuncios_update',
            payload: {}
        }).catch(() => { })
    }

    const updateDraft = (id, field, value) => {
        setAnuncios(prev => prev.map(a => {
            if (a.id !== id) return a
            const newDraft = { ...a._draft, [field]: value }
            const changed = Object.keys(DEFAULT_STYLE).some(k =>
                String(newDraft[k]) !== String(a[k] ?? DEFAULT_STYLE[k])
            )
            return { ...a, _draft: newDraft, _changed: changed }
        }))
    }

    const handleDiscard = (id) => {
        setAnuncios(prev => prev.map(a => a.id !== id ? a : {
            ...a,
            _draft: {
                texto: a.texto ?? '',
                font: a.font ?? DEFAULT_STYLE.font,
                size: a.size ?? DEFAULT_STYLE.size,
                icon: a.icon ?? DEFAULT_STYLE.icon,
                color: a.color ?? DEFAULT_STYLE.color,
                pos_x: a.pos_x ?? DEFAULT_STYLE.pos_x,
                pos_y: a.pos_y ?? DEFAULT_STYLE.pos_y,
            },
            _changed: false,
        }))
    }


    const promptSave = (id) => {
        const a = anuncios.find(x => x.id === id)
        if (!a?._draft?.texto?.trim()) {
            showToast('⚠️ El texto no puede estar vacío.', 'error')
            return
        }
        setConfirmSave({ id, texto: a._draft.texto.trim() })
    }

    const confirmarGuardar = async () => {
        const { id } = confirmSave
        setConfirmSave(null)
        setSaving(id)
        try {
            const a = anuncios.find(x => x.id === id)
            const payload = {
                texto: a._draft.texto.trim(),
                font: a._draft.font,
                size: parseFloat(a._draft.size),
                icon: a._draft.icon,
                color: a._draft.color,
                pos_x: parseInt(a._draft.pos_x),
                pos_y: parseInt(a._draft.pos_y),
                activo: a._draft.activo ?? true,
                updated_at: new Date().toISOString(),
            }
            const { error } = await supabase.from('anuncios').update(payload).eq('id', id)
            if (error) throw error
            setAnuncios(prev => prev.map(x => x.id !== id ? x : { ...x, ...payload, _draft: { ...x._draft, ...payload }, _changed: false }))
            notifyDisplay()
            showToast('✅ Anuncio guardado y publicado.')
        } catch (e) {
            showToast('❌ Error al guardar: ' + e.message, 'error')
        } finally {
            setSaving(null)
        }
    }


    const confirmarAgregar = async () => {
        setConfirmAdd(false)
        setSaving('new')
        try {
            const payload = { ...DEFAULT_STYLE, updated_at: new Date().toISOString() }
            const { data, error } = await supabase.from('anuncios').insert([payload]).select()
            if (error) throw error
            const nuevo = data[0]
            const newEntry = {
                ...DEFAULT_STYLE, ...nuevo,
                _draft: { ...DEFAULT_STYLE },
                _changed: false,
            }
            setAnuncios(prev => [...prev, newEntry])
            setExpandedId(nuevo.id)
            showToast('✅ Nuevo anuncio creado.')
        } catch (e) {
            showToast('❌ Error al crear: ' + e.message, 'error')
        } finally {
            setSaving(null)
        }
    }

    const confirmarEliminar = async () => {
        const { id } = confirmDelete
        setConfirmDelete(null)
        setSaving(id)
        try {
            const { error } = await supabase.from('anuncios').delete().eq('id', id)
            if (error) throw error
            setAnuncios(prev => prev.filter(a => a.id !== id))
            notifyDisplay()
            showToast('🗑️ Anuncio eliminado.')
        } catch (e) {
            showToast('❌ Error al eliminar: ' + e.message, 'error')
        } finally {
            setSaving(null)
        }
    }

    const movePos = (id, axis, delta) => {
        setAnuncios(prev => prev.map(a => {
            if (a.id !== id) return a
            const cur = parseInt(a._draft[axis]) || 0
            const newDraft = { ...a._draft, [axis]: cur + delta }
            return { ...a, _draft: newDraft, _changed: true }
        }))
    }

    const toggleActive = async (id, isActive) => {
        setSaving(id)
        try {
            const { error } = await supabase.from('anuncios').update({ activo: isActive }).eq('id', id)
            if (error) throw error
            setAnuncios(prev => prev.map(a => a.id === id ? { ...a, activo: isActive, _draft: { ...a._draft, activo: isActive } } : a))
            notifyDisplay()
            showToast(`Anuncio ${isActive ? 'encendido' : 'apagado'} en vivo.`)
        } catch (e) {
            showToast('❌ Error al cambiar estado: ' + e.message, 'error')
        } finally {
            setSaving(null)
        }
    }

    // ── Interactivo toggle ────────────────────────────────────────────────────
    const toggleInteractivo = async (id, value) => {
        setSaving(id)
        try {
            const { error } = await supabase.from('anuncios').update({ interactivo: value }).eq('id', id)
            if (error) throw error
            setAnuncios(prev => prev.map(a => a.id === id ? { ...a, interactivo: value } : a))
            notifyDisplay()
            showToast(`Modo interactivo ${value ? 'activado 🎞️' : 'desactivado'}.`)
        } catch (e) {
            showToast('❌ Error: ' + e.message, 'error')
        } finally {
            setSaving(null)
        }
    }

    // ── Image upload ──────────────────────────────────────────────────────────
    const BUCKET = 'anuncios-media'

    const uploadImages = async (id, files) => {
        setAnuncios(prev => prev.map(a => a.id === id ? { ...a, _uploadingImg: true } : a))
        const uploaded = []
        for (const file of Array.from(files)) {
            const ext  = file.name.split('.').pop()
            const path = `imagenes/${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
            const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
            if (upErr) { showToast('❌ Error subiendo imagen: ' + upErr.message, 'error'); continue }
            const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
            uploaded.push({ path, url: urlData.publicUrl, name: file.name })
        }
        if (uploaded.length === 0) {
            setAnuncios(prev => prev.map(a => a.id === id ? { ...a, _uploadingImg: false } : a))
            return
        }
        setAnuncios(prev => prev.map(a => {
            if (a.id !== id) return a
            const newImgs = [...a.imagenes, ...uploaded].map((img, i) => ({ ...img, orden: i }))
            return { ...a, imagenes: newImgs, _uploadingImg: false }
        }))
        // Persist immediately
        const a = anuncios.find(x => x.id === id)
        const newImgs = [...(a?.imagenes || []), ...uploaded].map((img, i) => ({ ...img, orden: i }))
        const { error } = await supabase.from('anuncios').update({ imagenes: newImgs }).eq('id', id)
        if (error) showToast('❌ Error guardando imágenes: ' + error.message, 'error')
        else {
            notifyDisplay()
            showToast(`✅ ${uploaded.length} imagen(es) subidas.`)
        }
    }

    const deleteImage = async (id, imgPath) => {
        await supabase.storage.from(BUCKET).remove([imgPath])
        setAnuncios(prev => prev.map(a => {
            if (a.id !== id) return a
            const newImgs = a.imagenes.filter(img => img.path !== imgPath).map((img, i) => ({ ...img, orden: i }))
            return { ...a, imagenes: newImgs }
        }))
        const a = anuncios.find(x => x.id === id)
        const newImgs = (a?.imagenes || []).filter(img => img.path !== imgPath).map((img, i) => ({ ...img, orden: i }))
        const { error } = await supabase.from('anuncios').update({ imagenes: newImgs }).eq('id', id)
        if (!error) {
            notifyDisplay()
            showToast('🗑️ Imagen eliminada.')
        } else {
            showToast('❌ Error al eliminar: ' + error.message, 'error')
        }
    }

    // ── Drag-to-reorder handlers ──────────────────────────────────────────────
    const handleImgDragStart = (anuncioId, idx, e) => {
        imgDragSrc.current = { anuncioId, idx }
        e.dataTransfer.effectAllowed = 'move'
        // Necesario para que funcione en Firefox
        e.dataTransfer.setData('text/plain', String(idx))
    }

    const handleImgDragEnter = (anuncioId, idx) => {
        if (!imgDragSrc.current || imgDragSrc.current.anuncioId !== anuncioId) return
        setImgDragOver({ anuncioId, idx })
    }

    const handleImgDragEnd = async (anuncioId) => {
        const src  = imgDragSrc.current
        const over = imgDragOver
        imgDragSrc.current = null
        setImgDragOver(null)
        if (!src || !over) return
        if (src.idx === over.idx) return

        let reordered
        setAnuncios(prev => prev.map(a => {
            if (a.id !== anuncioId) return a
            const imgs = [...a.imagenes].sort((x, y) => x.orden - y.orden)
            const [moved] = imgs.splice(src.idx, 1)
            imgs.splice(over.idx, 0, moved)
            reordered = imgs.map((img, i) => ({ ...img, orden: i }))
            return { ...a, imagenes: reordered }
        }))
        if (reordered) {
            const { error } = await supabase.from('anuncios').update({ imagenes: reordered }).eq('id', anuncioId)
            if (!error) {
                notifyDisplay()
                showToast('✅ Orden guardado.')
            } else {
                showToast('❌ Error al guardar orden: ' + error.message, 'error')
            }
        }
    }

    // ── Drop-zone handlers (upload by drag-from-desktop) ──────────────────────
    const handleDropZoneDragOver = (e, anuncioId) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'copy'
        setDropZoneActive(anuncioId)
    }
    const handleDropZoneDragLeave = (e) => {
        // Solo desactivar si sale del contenedor real
        if (!e.currentTarget.contains(e.relatedTarget)) setDropZoneActive(null)
    }
    const handleDropZoneDrop = (e, anuncioId) => {
        e.preventDefault()
        e.stopPropagation()
        setDropZoneActive(null)
        const files = e.dataTransfer.files
        if (files?.length > 0) uploadImages(anuncioId, files)
    }


    return (
        <div className="ga-page">

            {/* Toast */}
            {toast && (
                <div className={`ga-toast ${toast.type === 'error' ? 'ga-toast-error' : 'ga-toast-success'}`}>
                    {toast.msg}
                </div>
            )}

            {/* Dialog: Confirm Save */}
            {confirmSave && (
                <div className="ga-overlay">
                    <div className="ga-dialog">
                        <div className="ga-dialog-icon">📢</div>
                        <h3 className="ga-dialog-title">Publicar Anuncio</h3>
                        <p className="ga-dialog-body">¿Guardar y publicar este anuncio en pantalla <strong>inmediatamente</strong>?</p>
                        <div className="ga-dialog-preview">
                            <span className="ga-dialog-preview-label">Texto:</span>
                            <p className="ga-dialog-preview-text">"{confirmSave.texto}"</p>
                        </div>
                        <div className="ga-dialog-actions">
                            <button className="ga-btn-cancel" onClick={() => setConfirmSave(null)}>Cancelar</button>
                            <button className="ga-btn-confirm" onClick={confirmarGuardar}>✅ Publicar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Dialog: Confirm Add */}
            {confirmAdd && (
                <div className="ga-overlay">
                    <div className="ga-dialog">
                        <div className="ga-dialog-icon">➕</div>
                        <h3 className="ga-dialog-title">Nuevo Anuncio</h3>
                        <p className="ga-dialog-body">Se creará un nuevo anuncio vacío listo para configurar.</p>
                        <div className="ga-dialog-actions">
                            <button className="ga-btn-cancel" onClick={() => setConfirmAdd(false)}>Cancelar</button>
                            <button className="ga-btn-confirm" onClick={confirmarAgregar}>➕ Crear</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Dialog: Confirm Delete */}
            {confirmDelete && (
                <div className="ga-overlay">
                    <div className="ga-dialog">
                        <div className="ga-dialog-icon">🗑️</div>
                        <h3 className="ga-dialog-title">Eliminar Anuncio</h3>
                        <p className="ga-dialog-body">¿Eliminar este anuncio? Esta acción <strong>no se puede deshacer.</strong></p>
                        <div className="ga-dialog-actions">
                            <button className="ga-btn-cancel" onClick={() => setConfirmDelete(null)}>Cancelar</button>
                            <button className="ga-btn-danger" onClick={confirmarEliminar}>🗑️ Eliminar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Page Header */}
            <div className="ga-header-row">
                <div>
                    <h2 className="ga-title">📢 Gestor de Anuncios</h2>
                    <p className="ga-subtitle">Crea y personaliza los anuncios que se muestran en pantalla.</p>
                </div>
                <button className="ga-btn-add" onClick={() => setConfirmAdd(true)} disabled={saving === 'new'}>
                    <span className="ga-btn-add-icon">+</span>
                    <span>Nuevo Anuncio</span>
                </button>
            </div>

            {loading ? (
                <div className="ga-loading">Cargando anuncios...</div>
            ) : (
                <>
                    {anuncios.length === 0 && (
                        <div className="ga-empty-state">
                            <div className="ga-empty-icon">📭</div>
                            <p>No hay anuncios todavía.</p>
                            <p className="ga-empty-hint">Usa <strong>+ Nuevo Anuncio</strong> para crear el primero.</p>
                        </div>
                    )}

                    <div className="ga-list">
                        {anuncios.map((a, idx) => {
                            const isSaving = saving === a.id
                            const isExpanded = expandedId === a.id
                            const d = a._draft
                            const charCount = (d.texto || '').length

                            return (
                                <div key={a.id} className={`ga-card ${a._changed ? 'ga-card-dirty' : ''}`}>
                                    {/* Card Header */}
                                    <div className="ga-card-header" onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                                        <div className="ga-card-header-left">
                                            <span style={{ fontSize: '1.2rem' }}>{d.icon}</span>
                                            <span className="ga-card-number">Anuncio #{idx + 1}</span>

                                            {/* Toggle: Activo */}
                                            <label className="ga-switch" onClick={(e) => e.stopPropagation()} title={a.activo !== false ? 'Desactivar Anuncio' : 'Activar Anuncio'}>
                                                <input
                                                    type="checkbox"
                                                    checked={a.activo !== false}
                                                    onChange={(e) => toggleActive(a.id, e.target.checked)}
                                                    disabled={isSaving}
                                                />
                                                <span className="ga-slider round"></span>
                                            </label>

                                            {/* Toggle: Interactivo */}
                                            <div className="ga-interactivo-toggle" onClick={e => e.stopPropagation()}>
                                                <label className={`ga-switch ga-switch--purple ${a.interactivo ? 'is-on' : ''}`} title={a.interactivo ? 'Desactivar modo interactivo' : 'Activar modo interactivo (imágenes)'}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!a.interactivo}
                                                        onChange={(e) => toggleInteractivo(a.id, e.target.checked)}
                                                        disabled={isSaving}
                                                    />
                                                    <span className="ga-slider round"></span>
                                                </label>
                                                <span className={`ga-interactivo-label ${a.interactivo ? 'ga-interactivo-label--on' : ''}`}>🎞️ Interactivo</span>
                                            </div>

                                            {d.texto && <span className="ga-card-preview-text">{d.texto.slice(0, 40)}{d.texto.length > 40 ? '…' : ''}</span>}
                                        </div>
                                        <div className="ga-card-header-right">
                                            {a._changed && <span className="ga-unsaved-badge">⚠️ Sin guardar</span>}
                                            <button className="ga-btn-delete-icon" onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: a.id }) }} disabled={isSaving} title="Eliminar">🗑️</button>
                                            <span className="ga-expand-icon">{isExpanded ? '▲' : '▼'}</span>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="ga-card-body">
                                            <div className="ga-controls-grid">
                                                {/* LEFT COLUMN */}
                                                <div className="ga-left-col">
                                                    {/* Typography */}
                                                    <div className="ga-control-section">
                                                        <label className="ga-control-label">TIPOGRAFÍA</label>
                                                        <div className="ga-font-btns">
                                                            {FONTS.map(f => (
                                                                <button
                                                                    key={f.value}
                                                                    className={`ga-font-btn ${d.font === f.value ? 'active' : ''}`}
                                                                    style={{ fontFamily: f.value }}
                                                                    onClick={() => updateDraft(a.id, 'font', f.value)}
                                                                >
                                                                    {f.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Scale */}
                                                    <div className="ga-control-section">
                                                        <label className="ga-control-label">
                                                            ESCALA (TAMAÑO)
                                                            <span className="ga-scale-value">{parseFloat(d.size).toFixed(1)}x</span>
                                                        </label>
                                                        <div className="ga-scale-row">
                                                            <button className="ga-scale-btn" onClick={() => updateDraft(a.id, 'size', Math.max(0.5, parseFloat(d.size) - 0.1).toFixed(1))}>−</button>
                                                            <input
                                                                type="range" min="0.5" max="2.5" step="0.1"
                                                                value={parseFloat(d.size)}
                                                                onChange={e => updateDraft(a.id, 'size', parseFloat(e.target.value).toFixed(1))}
                                                                className="ga-range"
                                                            />
                                                            <button className="ga-scale-btn" onClick={() => updateDraft(a.id, 'size', Math.min(2.5, parseFloat(d.size) + 0.1).toFixed(1))}>+</button>
                                                        </div>
                                                    </div>

                                                    {/* Icon */}
                                                    <div className="ga-control-section">
                                                        <label className="ga-control-label">ICONO</label>
                                                        <div className="ga-icon-btns">
                                                            {ICONS.map(ic => (
                                                                <button
                                                                    key={ic}
                                                                    className={`ga-icon-btn ${d.icon === ic ? 'active' : ''}`}
                                                                    onClick={() => updateDraft(a.id, 'icon', ic)}
                                                                >
                                                                    {ic}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* RIGHT COLUMN */}
                                                <div className="ga-right-col">
                                                    {/* Color */}
                                                    <div className="ga-control-section">
                                                        <label className="ga-control-label">COLOR DE LETRA</label>
                                                        <div className="ga-color-swatches">
                                                            {COLORS.map(c => (
                                                                <button
                                                                    key={c.value}
                                                                    className={`ga-color-swatch ${d.color === c.value ? 'active' : ''}`}
                                                                    style={{ background: c.value }}
                                                                    title={c.label}
                                                                    onClick={() => updateDraft(a.id, 'color', c.value)}
                                                                />
                                                            ))}
                                                            {/* Custom color picker */}
                                                            <label className="ga-color-custom" title="Color personalizado">
                                                                <input
                                                                    type="color"
                                                                    value={d.color}
                                                                    onChange={e => updateDraft(a.id, 'color', e.target.value)}
                                                                />
                                                                <span>🎨</span>
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {/* Position */}
                                                    <div className="ga-control-section">
                                                        <label className="ga-control-label">
                                                            POSICIÓN
                                                            <span className="ga-pos-label-vals">(X: {d.pos_x}, Y: {d.pos_y})</span>
                                                            <button className="ga-pos-reset" onClick={() => { updateDraft(a.id, 'pos_x', 0); updateDraft(a.id, 'pos_y', 0) }}>RESET</button>
                                                        </label>
                                                        <div className="ga-joystick-wrap">
                                                            <div className="ga-joystick">
                                                                <button className="ga-joy-btn ga-joy-up" onClick={() => movePos(a.id, 'pos_y', -20)}>▲</button>
                                                                <button className="ga-joy-btn ga-joy-left" onClick={() => movePos(a.id, 'pos_x', -20)}>◀</button>
                                                                <div className="ga-joy-center-dot" />
                                                                <button className="ga-joy-btn ga-joy-right" onClick={() => movePos(a.id, 'pos_x', 20)}>▶</button>
                                                                <button className="ga-joy-btn ga-joy-down" onClick={() => movePos(a.id, 'pos_y', 20)}>▼</button>
                                                            </div>
                                                            <div className="ga-pos-inputs">
                                                                <div className="ga-pos-input-group">
                                                                    <label>EJE HORIZONTAL (X)</label>
                                                                    <input type="number" value={d.pos_x}
                                                                        onChange={e => updateDraft(a.id, 'pos_x', parseInt(e.target.value) || 0)}
                                                                        className="ga-pos-input" />
                                                                </div>
                                                                <div className="ga-pos-input-group">
                                                                    <label>EJE VERTICAL (Y)</label>
                                                                    <input type="number" value={d.pos_y}
                                                                        onChange={e => updateDraft(a.id, 'pos_y', parseInt(e.target.value) || 0)}
                                                                        className="ga-pos-input" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Text area */}
                                            <div className="ga-control-section" style={{ marginTop: '16px' }}>
                                                <div className="ga-editor-label-row">
                                                    <label className="ga-control-label">TEXTO DEL ANUNCIO</label>
                                                    <span className={`ga-char-count ${charCount > MAX_CHARS ? 'ga-char-over' : ''}`}>{charCount} / {MAX_CHARS}</span>
                                                </div>
                                                <textarea
                                                    className="ga-textarea"
                                                    value={d.texto}
                                                    onChange={e => updateDraft(a.id, 'texto', e.target.value)}
                                                    placeholder="Escribe el texto del anuncio..."
                                                    rows={3}
                                                    maxLength={MAX_CHARS}
                                                    disabled={isSaving}
                                                    style={{ fontFamily: d.font, color: d.color, fontSize: `${parseFloat(d.size) * 0.95}rem` }}
                                                />
                                            </div>

                                            {/* LIVE PREVIEW */}
                                            <div className="ga-preview-section">
                                                <div className="ga-preview-header">
                                                    <span className="ga-preview-label-v2">Vista previa</span>
                                                </div>
                                                <div className="ga-preview-screen-v2">
                                                    <div
                                                        className="ga-preview-minimap-box"
                                                        style={{
                                                            transform: `translate(calc(-50% + ${d.pos_x * 0.25}px), calc(-50% + ${d.pos_y * 0.25}px)) scale(${d.size})`
                                                        }}
                                                    >
                                                        <div className="ga-preview-minimap-dot" />
                                                    </div>
                                                </div>
                                                <div className="ga-preview-stats">
                                                    <span>X offset: <strong>{d.pos_x}px</strong></span>
                                                    <span>Y offset: <strong>{d.pos_y}px</strong></span>
                                                    <span>Escala: <strong>{d.size}x</strong></span>
                                                </div>
                                            </div>

                                            {/* ── PANEL INTERACTIVO (Imágenes) ── */}
                                            {a.interactivo && (
                                                <div className="ga-imagenes-panel">

                                                    {/* Cabecera */}
                                                    <div className="ga-imagenes-header">
                                                        <div className="ga-imagenes-header-left">
                                                            <span className="ga-imagenes-title">🎞️ Imágenes Interactivas</span>
                                                            <span className="ga-imagenes-badge">{a.imagenes.length} imagen{a.imagenes.length !== 1 ? 'es' : ''}</span>
                                                        </div>
                                                        <label className={`ga-upload-btn ${a._uploadingImg ? 'uploading' : ''}`}>
                                                            {a._uploadingImg ? <><span className="ga-upload-spinner"/> Subiendo...</> : <>📤 Subir archivos</>}
                                                            <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                                                                disabled={a._uploadingImg}
                                                                onChange={e => uploadImages(a.id, e.target.files)}
                                                            />
                                                        </label>
                                                    </div>

                                                    {/* Drop zone */}
                                                    <div
                                                        className={`ga-drop-zone ${dropZoneActive === a.id ? 'ga-drop-zone--active' : ''} ${a._uploadingImg ? 'ga-drop-zone--uploading' : ''}`}
                                                        onDragOver={e => handleDropZoneDragOver(e, a.id)}
                                                        onDragLeave={handleDropZoneDragLeave}
                                                        onDrop={e => handleDropZoneDrop(e, a.id)}
                                                    >
                                                        {a._uploadingImg ? (
                                                            <div className="ga-drop-zone-inner">
                                                                <span className="ga-drop-zone-spinner"/>
                                                                <span>Subiendo imágenes...</span>
                                                            </div>
                                                        ) : dropZoneActive === a.id ? (
                                                            <div className="ga-drop-zone-inner">
                                                                <span className="ga-drop-zone-icon">📥</span>
                                                                <span>Suelta para subir</span>
                                                            </div>
                                                        ) : (
                                                            <div className="ga-drop-zone-inner">
                                                                <span className="ga-drop-zone-icon">🖼️</span>
                                                                <span>Arrastra imágenes aquí para subirlas</span>
                                                                <span className="ga-drop-zone-hint">JPG · PNG · GIF · WebP</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Lista de imágenes */}
                                                    {a.imagenes.length > 0 && (
                                                        <div className="ga-imagenes-grid">
                                                            {a.imagenes
                                                                .slice().sort((x, y) => x.orden - y.orden)
                                                                .map((img, imgIdx) => {
                                                                    const isDragging = imgDragSrc.current?.anuncioId === a.id && imgDragSrc.current?.idx === imgIdx
                                                                    const isOver     = imgDragOver?.anuncioId === a.id && imgDragOver?.idx === imgIdx
                                                                    return (
                                                                        <div
                                                                            key={img.path || imgIdx}
                                                                            className={`ga-img-card ${isDragging ? 'ga-img-card--dragging' : ''} ${isOver ? 'ga-img-card--over' : ''}`}
                                                                            draggable
                                                                            onDragStart={e => handleImgDragStart(a.id, imgIdx, e)}
                                                                            onDragEnter={() => handleImgDragEnter(a.id, imgIdx)}
                                                                            onDragOver={e => e.preventDefault()}
                                                                            onDragEnd={() => handleImgDragEnd(a.id)}
                                                                        >
                                                                            {/* Drag handle */}
                                                                            <div className="ga-img-handle" title="Arrastra para reordenar">
                                                                                <span>⋮⋮</span>
                                                                            </div>

                                                                            {/* Thumbnail */}
                                                                            <div className="ga-img-thumb-wrap">
                                                                                <span className="ga-img-badge">#{imgIdx + 1}</span>
                                                                                <img
                                                                                    src={img.url}
                                                                                    alt={img.name}
                                                                                    className="ga-img-thumb-lg"
                                                                                    onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="76" viewBox="0 0 100 76"><rect width="100" height="76" fill="%230a0e20"/><text x="50" y="42" text-anchor="middle" fill="%23444" font-size="24">🖼</text></svg>' }}
                                                                                />
                                                                            </div>

                                                                            {/* Nombre */}
                                                                            <div className="ga-img-card-name" title={img.name}>
                                                                                {img.name.length > 22 ? img.name.slice(0, 20) + '…' : img.name}
                                                                            </div>

                                                                            {/* Eliminar */}
                                                                            <button
                                                                                className="ga-img-card-delete"
                                                                                onClick={() => deleteImage(a.id, img.path)}
                                                                                title="Eliminar"
                                                                            >✕</button>
                                                                        </div>
                                                                    )
                                                                })
                                                            }
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Actions */}
                                            <div className="ga-card-actions">
                                                <button className="ga-btn-revert" onClick={() => handleDiscard(a.id)} disabled={!a._changed || isSaving}>↩ Descartar</button>
                                                <button className="ga-btn-guardar" onClick={() => promptSave(a.id)} disabled={!a._changed || isSaving || !d.texto?.trim()}>
                                                    {isSaving ? '⏳ Guardando...' : '💾 Guardar y Publicar'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {anuncios.length > 0 && (
                        <button className="ga-btn-add-bottom" onClick={() => setConfirmAdd(true)} disabled={saving === 'new'}>
                            <span>+</span> Agregar otro anuncio
                        </button>
                    )}
                </>
            )}
        </div>
    )
}

export default GestorAnuncios
