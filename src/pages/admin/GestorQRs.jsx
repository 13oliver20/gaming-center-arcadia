import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import './GestorQRs.css'

const GestorQRs = () => {
    const [config, setConfig] = useState({ wifi: null, whatsapp: null })
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState(null)
    const [saveDialog, setSaveDialog] = useState(null) // { tipo, file, campo1, campo2 }
    const [saving, setSaving] = useState(false)
    const [isActive, setIsActive] = useState(true)

    // Local state for forms
    const [wifiState, setWifiState] = useState({ file: null, preview: null, campo1: '', campo2: '' })
    const [waState, setWaState] = useState({ file: null, preview: null, campo1: '' })

    const wifiRef = useRef(null)
    const waRef = useRef(null)

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    const fetchConfig = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase.from('configuracion_qrs').select('*')
            if (error) throw error
            const wifi = data.find(d => d.tipo === 'wifi')
            const wa = data.find(d => d.tipo === 'whatsapp')

            setConfig({ wifi, whatsapp: wa })

            setWifiState({
                file: null,
                preview: wifi?.imagen_url || null,
                campo1: wifi?.campo_1 || '',
                campo2: wifi?.campo_2 || ''
            })
            setWaState({
                file: null,
                preview: wa?.imagen_url || null,
                campo1: wa?.campo_1 || ''
            })
            setIsActive(wifi?.isactive ?? true)
        } catch (err) {
            console.error(err)
            showToast('❌ Error cargando configuración', 'error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchConfig()
    }, [])

    const handleFileChange = (tipo, e) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            showToast('Solo se permiten imágenes (PNG, JPG, etc).', 'error')
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast('La imagen no puede pesar más de 5MB.', 'error')
            return
        }

        const preview = URL.createObjectURL(file)
        if (tipo === 'wifi') setWifiState(s => ({ ...s, file, preview }))
        else setWaState(s => ({ ...s, file, preview }))
    }

    const triggerSave = (tipo) => {
        if (tipo === 'wifi') {
            setSaveDialog({ tipo, file: wifiState.file, campo1: wifiState.campo1, campo2: wifiState.campo2 })
        } else {
            setSaveDialog({ tipo, file: waState.file, campo1: waState.campo1, campo2: '' })
        }
    }

    const confirmSave = async () => {
        if (!saveDialog) return
        setSaving(true)
        const { tipo, file, campo1, campo2 } = saveDialog

        try {
            let finalUrl = null

            if (file) {
                // Remove old image if exists
                if (config[tipo]?.imagen_url) {
                    const oldPath = config[tipo].imagen_url.split('/').pop()
                    if (oldPath) await supabase.storage.from('qrs').remove([oldPath])
                }

                const fileExt = file.name.split('.').pop()
                const fileName = `${tipo}_${Date.now()}.${fileExt}`

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('qrs')
                    .upload(fileName, file, { upsert: true })

                if (uploadError) throw uploadError

                const { data: urlData } = supabase.storage.from('qrs').getPublicUrl(fileName)
                finalUrl = urlData.publicUrl
            } else {
                finalUrl = config[tipo]?.imagen_url
            }

            const payload = {
                tipo,
                imagen_url: finalUrl,
                campo_1: campo1,
                campo_2: campo2
            }

            const { error: upsertError } = await supabase
                .from('configuracion_qrs')
                .upsert(payload, { onConflict: 'tipo' })

            if (upsertError) throw upsertError

            showToast(`✅ Configuración de ${tipo.toUpperCase()} guardada.`, 'success')
            fetchConfig()

        } catch (err) {
            console.error(err)
            showToast('❌ Error guardando: ' + err.message, 'error')
        } finally {
            setSaving(false)
            setSaveDialog(null)
        }
    }

    const toggleActive = async () => {
        const newVal = !isActive
        setIsActive(newVal)
        await supabase.from('configuracion_qrs').update({ isactive: newVal }).neq('tipo', '')
        showToast(newVal ? '🟢 QRs Activados' : '🔴 QRs Desactivados', 'success')
    }

    return (
        <div className="hq-container">
            <div className="hq-header">
                <h2><span>📱</span> Gestor de QRs</h2>
                {/* Switch toggle layout */}
                <span className="hq-records-count">118 / 1000</span>
            </div>

            <div className={`hq-global-toggle ${isActive ? 'on' : 'off'}`} onClick={toggleActive}>
                <div className="hq-toggle-knob"></div>
                <span className="hq-toggle-text">{isActive ? 'ON' : 'OFF'}</span>
            </div>

            {loading ? (
                <div className="hq-loading">Cargando configuración...</div>
            ) : (
                <div className="hq-grid">

                    {/* Tarjeta WIFI */}
                    <div className="hq-card">
                        <div className="hq-card-header">
                            <span className="hq-card-icon">🛜</span> WiFi Config
                        </div>
                        <input type="file" accept="image/*" hidden ref={wifiRef} onChange={(e) => handleFileChange('wifi', e)} />

                        <div className="hq-image-box" onClick={() => wifiRef.current?.click()}>
                            {wifiState.preview ? (
                                <img src={wifiState.preview} alt="WiFi QR" className="hq-preview-img" />
                            ) : (
                                <div className="hq-upload-placeholder">
                                    <span className="hq-upload-icon">↑</span>
                                    <span>Upload WiFi QR</span>
                                </div>
                            )}
                        </div>

                        <div className="hq-form-group">
                            <label>SSID</label>
                            <input
                                type="text"
                                placeholder="Not Set"
                                value={wifiState.campo1}
                                onChange={e => setWifiState(s => ({ ...s, campo1: e.target.value }))}
                            />
                        </div>
                        <div className="hq-form-group">
                            <label>PASSWORD</label>
                            <input
                                type="text"
                                placeholder="Not Set"
                                value={wifiState.campo2}
                                onChange={e => setWifiState(s => ({ ...s, campo2: e.target.value }))}
                            />
                        </div>

                        <button className="hq-save-btn" onClick={() => triggerSave('wifi')}>
                            Guardar Cambios WiFi
                        </button>
                    </div>

                    {/* Tarjeta WhatsApp */}
                    <div className="hq-card">
                        <div className="hq-card-header">
                            <span className="hq-card-icon">💬</span> WhatsApp Config
                        </div>
                        <input type="file" accept="image/*" hidden ref={waRef} onChange={(e) => handleFileChange('whatsapp', e)} />

                        <div className="hq-image-box" onClick={() => waRef.current?.click()}>
                            {waState.preview ? (
                                <img src={waState.preview} alt="WhatsApp QR" className="hq-preview-img" />
                            ) : (
                                <div className="hq-upload-placeholder">
                                    <span className="hq-upload-icon">↑</span>
                                    <span>Upload WhatsApp QR</span>
                                </div>
                            )}
                        </div>

                        <div className="hq-form-group">
                            <label>DISPLAY MESSAGE</label>
                            <input
                                type="text"
                                placeholder="Not Set"
                                value={waState.campo1}
                                onChange={e => setWaState(s => ({ ...s, campo1: e.target.value }))}
                            />
                        </div>

                        <button className="hq-save-btn" onClick={() => triggerSave('whatsapp')}>
                            Guardar Cambios WhatsApp
                        </button>
                    </div>
                </div>
            )}

            {/* Dialog de Guardado */}
            {saveDialog && (
                <div className="hq-overlay" onClick={() => !saving && setSaveDialog(null)}>
                    <div className="hq-dialog" onClick={e => e.stopPropagation()}>
                        <div className="hq-dialog-icon">💾</div>
                        <h3 className="hq-dialog-title">Confirmar {saveDialog.tipo.toUpperCase()}</h3>
                        <div className="hq-dialog-body">
                            <p>¿Seguro que deseas sobrescribir la configuración de {saveDialog.tipo}?</p>
                            {saveDialog.file && <p><strong>Nueva imagen:</strong> {saveDialog.file.name}</p>}
                            <p><strong>Configuración extra:</strong> {saveDialog.campo1}</p>
                            <p className="hq-warn-text">La imagen anterior se borrará.</p>
                        </div>
                        <div className="hq-dialog-actions">
                            <button className="hq-btn-cancel" onClick={() => setSaveDialog(null)} disabled={saving}>Cancelar</button>
                            <button className="hq-btn-confirm" onClick={confirmSave} disabled={saving}>
                                {saving ? 'Guardando...' : 'Sí, guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className={`hq-toast ${toast.type}`}>
                    {toast.msg}
                </div>
            )}
        </div>
    )
}

export default GestorQRs
