import React, { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import './ProductoUploader.css'

// Usamos el bucket "qrs" que ya existe y funciona, para evitar problemas de permisos. 
// Guardaremos todo dentro de una carpeta "tienda/".
const BUCKET = 'qrs'

const ProductoUploader = ({ categoria, subcategoria, accentColor }) => {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [toast, setToast] = useState(null)
    const [dragIdx, setDragIdx] = useState(null)
    const [dragOver, setDragOver] = useState(null)
    const [dropZoneActive, setDropZoneActive] = useState(false)
    const fileInputRef = useRef(null)
    const descTimers = useRef({})

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    /* ---- Load from Supabase ---- */
    const fetchItems = useCallback(async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('tienda_productos')
                .select('*')
                .eq('categoria', categoria)
                .eq('subcategoria', subcategoria)
                .order('orden', { ascending: true })
            if (error) throw error
            setItems(data || [])
        } catch (e) {
            showToast('❌ Error al cargar: ' + e.message, 'error')
        } finally {
            setLoading(false)
        }
    }, [categoria, subcategoria])

    useEffect(() => { fetchItems() }, [fetchItems])

    /* ---- Upload files to Storage + insert DB row ---- */
    const uploadFiles = async (files) => {
        const valids = [...files].filter(f => f.type.startsWith('image/'))
        if (!valids.length) return
        setUploading(true)
        try {
            const maxOrden = items.length > 0 ? Math.max(...items.map(i => i.orden)) : -1

            // Format strings for storage paths (remove accents, spaces to underscores)
            const safeStr = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_").toLowerCase()
            const safeCat = safeStr(categoria)
            const safeSub = safeStr(subcategoria)

            for (let i = 0; i < valids.length; i++) {
                const file = valids[i]
                const ext = file.name.split('.').pop()
                const path = `tienda/${safeCat}/${safeSub}/${Date.now()}_${i}.${ext}`

                /* 1. Upload binary to Storage */
                const { error: upErr } = await supabase.storage
                    .from(BUCKET)
                    .upload(path, file, { upsert: false })
                if (upErr) throw new Error('Upload falló: ' + upErr.message)

                /* 2. Get public URL */
                const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

                /* 3. Insert metadata row */
                const { data: row, error: dbErr } = await supabase
                    .from('tienda_productos')
                    .insert([{
                        categoria,
                        subcategoria,
                        storage_path: path,
                        url: urlData.publicUrl,
                        descripcion: '',
                        orden: maxOrden + 1 + i,
                    }])
                    .select()
                    .single()
                if (dbErr) throw new Error('DB falló: ' + dbErr.message)
                setItems(prev => [...prev, row])
            }
            showToast(`✅ ${valids.length} imagen${valids.length > 1 ? 'es' : ''} subida${valids.length > 1 ? 's' : ''}.`)
        } catch (e) {
            console.error('Upload error:', e)
            showToast('❌ ' + e.message, 'error')
        } finally {
            setUploading(false)
        }
    }

    const handleFileInput = (e) => { uploadFiles(e.target.files); e.target.value = '' }
    const handleDropZone = (e) => { e.preventDefault(); setDropZoneActive(false); uploadFiles(e.dataTransfer.files) }

    /* ---- Description auto-save (debounced 800ms) ---- */
    const updateDesc = (id, value) => {
        setItems(prev => prev.map(it => it.id === id ? { ...it, descripcion: value } : it))
        clearTimeout(descTimers.current[id])
        descTimers.current[id] = setTimeout(async () => {
            await supabase.from('tienda_productos').update({ descripcion: value }).eq('id', id)
        }, 800)
    }

    /* ---- Delete ---- */
    const removeItem = async (id) => {
        const item = items.find(i => i.id === id)
        if (!item) return
        try {
            await supabase.storage.from(BUCKET).remove([item.storage_path])
            await supabase.from('tienda_productos').delete().eq('id', id)
            setItems(prev => prev.filter(i => i.id !== id))
            showToast('🗑️ Imagen eliminada.')
        } catch (e) {
            showToast('❌ Error al eliminar: ' + e.message, 'error')
        }
    }

    /* ---- Drag-to-reorder ---- */
    const onDragStart = (e, idx) => { setDragIdx(idx); e.dataTransfer.effectAllowed = 'move' }
    const onDragOver = (e, idx) => { e.preventDefault(); setDragOver(idx) }
    const onDrop = async (e, idx) => {
        e.preventDefault()
        if (dragIdx === null || dragIdx === idx) { reset(); return }
        const arr = [...items]
        const [moved] = arr.splice(dragIdx, 1)
        arr.splice(idx, 0, moved)
        // Reassign orden values
        const updated = arr.map((item, i) => ({ ...item, orden: i }))
        setItems(updated)
        reset()
        // Persist new order
        try {
            await Promise.all(updated.map(item =>
                supabase.from('tienda_productos').update({ orden: item.orden }).eq('id', item.id)
            ))
        } catch (e) {
            showToast('❌ Error al guardar orden: ' + e.message, 'error')
        }
    }
    const reset = () => { setDragIdx(null); setDragOver(null) }
    const onDragEnd = () => reset()

    return (
        <div className="pu-wrap">
            {/* Toast */}
            {toast && (
                <div className={`pu-toast ${toast.type === 'error' ? 'pu-toast-error' : 'pu-toast-success'}`}>
                    {toast.msg}
                </div>
            )}

            {/* Breadcrumb */}
            <div className="pu-breadcrumb" style={{ '--pu-color': accentColor }}>
                <span>{categoria}</span>
                <span className="pu-sep">›</span>
                <span style={{ color: accentColor, fontWeight: 700 }}>{subcategoria}</span>
            </div>

            {/* Drop zone */}
            <div
                className={`pu-dropzone ${dropZoneActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
                style={{ '--pu-color': accentColor }}
                onClick={() => !uploading && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDropZoneActive(true) }}
                onDragLeave={() => setDropZoneActive(false)}
                onDrop={handleDropZone}
            >
                {uploading ? (
                    <>
                        <div className="pu-dz-icon pu-spin">⏳</div>
                        <p className="pu-dz-text">Subiendo imágenes a Supabase…</p>
                    </>
                ) : (
                    <>
                        <div className="pu-dz-icon">📁</div>
                        <p className="pu-dz-text">Arrastra imágenes aquí o <span>haz clic para seleccionar</span></p>
                        <p className="pu-dz-hint">PNG, JPG, WEBP — múltiples archivos permitidos</p>
                    </>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileInput} />
            </div>

            {/* Loading */}
            {loading && <div className="pu-loading">Cargando imágenes…</div>}

            {/* Grid */}
            {!loading && items.length > 0 && (
                <>
                    <div className="pu-grid-header">
                        <span className="pu-count">{items.length} imagen{items.length !== 1 ? 'es' : ''}</span>
                        <span className="pu-tip">⟺ Arrastra las tarjetas para reordenarlas</span>
                    </div>
                    <div className="pu-grid">
                        {items.map((item, idx) => (
                            <div
                                key={item.id}
                                className={`pu-card ${dragIdx === idx ? 'pu-dragging' : ''} ${dragOver === idx && dragIdx !== idx ? 'pu-drop-target' : ''}`}
                                style={{ '--pu-color': accentColor }}
                                draggable
                                onDragStart={e => onDragStart(e, idx)}
                                onDragOver={e => onDragOver(e, idx)}
                                onDrop={e => onDrop(e, idx)}
                                onDragEnd={onDragEnd}
                            >
                                <div className="pu-order-badge" style={{ background: accentColor }}>#{idx + 1}</div>
                                <div className="pu-drag-handle" title="Reordenar">⠿</div>
                                <button className="pu-delete-btn" onClick={() => removeItem(item.id)} title="Eliminar">✕</button>
                                <div className="pu-img-wrap">
                                    <img src={item.url} alt={item.descripcion || `Producto ${idx + 1}`} className="pu-img" />
                                </div>
                                <div className="pu-desc-wrap">
                                    <textarea
                                        className="pu-desc"
                                        placeholder="Descripción del producto…"
                                        value={item.descripcion || ''}
                                        onChange={e => updateDesc(item.id, e.target.value)}
                                        rows={2}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Empty */}
            {!loading && items.length === 0 && (
                <div className="pu-empty">
                    <span>🖼️</span>
                    <p>No hay imágenes cargadas todavía.</p>
                </div>
            )}
        </div>
    )
}

export default ProductoUploader
