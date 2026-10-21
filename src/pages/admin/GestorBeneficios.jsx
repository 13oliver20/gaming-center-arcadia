import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import './GestorBeneficios.css'

const GestorBeneficios = () => {
    const [beneficios, setBeneficios] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [toast, setToast] = useState(null)

    // Form states
    const [nuevoTexto, setNuevoTexto] = useState('')

    // Modal states
    const [editModal, setEditModal] = useState(null) // null or { id, texto }
    const [deleteModal, setDeleteModal] = useState(null) // null or { id }
    const [confirmAddModal, setConfirmAddModal] = useState(false)

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const fetchBeneficios = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('beneficios_cliente')
                .select('*')
                .limit(1)

            if (error) throw error
            if (data && data.length > 0) {
                setBeneficios(data)
                setNuevoTexto(data[0].texto) // Load the existing text into the input
            }
        } catch (e) {
            console.error(e)
            showToast('❌ Error al cargar beneficio: ' + e.message, 'error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchBeneficios()
    }, [])

    const handleAdd = () => {
        if (!nuevoTexto.trim()) {
            showToast('⚠️ El texto no puede estar vacío.', 'error')
            return
        }
        setConfirmAddModal(true)
    }

    const handleConfirmAdd = async () => {
        setConfirmAddModal(false)
        setSaving(true)
        try {
            const payload = { texto: nuevoTexto.trim() }
            
            if (beneficios.length > 0) {
                // Update existing
                const { error } = await supabase
                    .from('beneficios_cliente')
                    .update(payload)
                    .eq('id', beneficios[0].id)
                if (error) throw error
                setBeneficios([{ ...beneficios[0], ...payload }])
            } else {
                // Insert new
                const { data, error } = await supabase
                    .from('beneficios_cliente')
                    .insert([payload])
                    .select()
                if (error) throw error
                setBeneficios(data)
            }
            showToast('✅ Beneficio guardado exitosamente.')
        } catch (e) {
            showToast('❌ Error al guardar: ' + e.message, 'error')
        } finally {
            setSaving(false)
            setIsEditing(false)
        }
    }

    return (
        <div className="gb-page">
            {toast && (
                <div className={`gb-toast ${toast.type === 'error' ? 'gb-toast-error' : 'gb-toast-success'}`}>
                    {toast.msg}
                </div>
            )}

            {/* Confirm Add Modal */}
            {confirmAddModal && (
                <div className="gb-overlay">
                    <div className="gb-dialog">
                        <div className="gb-dialog-icon">❓</div>
                        <h3 className="gb-dialog-title">Confirmar Guardado</h3>
                        <p className="gb-dialog-body">¿Estás seguro de que deseas guardar este beneficio?</p>
                        <div className="gb-dialog-actions">
                            <button className="gb-btn-cancel" onClick={() => setConfirmAddModal(false)} disabled={saving}>Cancelar</button>
                            <button className="gb-btn-confirm" onClick={handleConfirmAdd} disabled={saving}>
                                {saving ? 'Guardando...' : '💾 Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="gb-header-row">
                <div>
                    <h2 className="gb-title">🎁 Beneficios Cliente</h2>
                    <p className="gb-subtitle">Gestiona el beneficio que se muestra a los clientes.</p>
                </div>
            </div>

            {/* Input Area */}
            <div className="gb-input-area">
                <textarea
                    className="gb-textarea"
                    placeholder="Escribe el beneficio para el cliente..."
                    value={nuevoTexto}
                    onChange={e => setNuevoTexto(e.target.value)}
                    disabled={!isEditing || saving || loading}
                />
                <button
                    className="gb-btn-add"
                    onClick={() => {
                        if (!isEditing) {
                            setIsEditing(true)
                        } else {
                            handleAdd()
                        }
                    }}
                    disabled={saving || loading || (isEditing && !nuevoTexto.trim())}
                >
                    {isEditing ? <><span>💾</span> Guardar</> : <><span>✏️</span> Editar</>}
                </button>
            </div>

            {loading && (
                <div style={{ textAlign: 'center', color: '#8892b0', marginTop: '1rem' }}>Cargando datos...</div>
            )}
        </div>
    )
}

export default GestorBeneficios
