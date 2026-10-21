import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import './GestorDisplayAdmin.css'

// ─── Constantes ─────────────────────────────────────────────────────────────
const QR_LAYOUT_ID      = 'qr_layout'
const SORTEOS_LAYOUT_ID = 'sorteos_layout'
const LOGO_LAYOUT_ID    = 'logo_layout'
const TEXT_LAYOUT_ID    = 'text_layout'

const DEFAULT_QR      = { pos_x: 50, pos_y: 0,  scale: 1.0 }
const DEFAULT_SORTEOS = { pos_x: 50, pos_y: 0,  scale: 1.0 }
const DEFAULT_LOGO    = { pos_x: 0,  pos_y: 0,    scale: 1.0 }
const DEFAULT_TEXT    = { pos_x: 0,  pos_y: 0,    scale: 1.0, texto: 'GAMING CENTER ARCADIA', efecto: 'rgb-flow' }

const TEXT_EFFECTS = [
    { id: 'rgb-flow',    label: 'RGB Flow',     emoji: '🌈', desc: 'Arcoíris deslizante' },
    { id: 'neon-pulse',  label: 'Neon Pulse',   emoji: '⚡', desc: 'Brillo neón pulsante' },
    { id: 'plasma',      label: 'Plasma',       emoji: '🔮', desc: 'Gradiente violeta-azul' },
    { id: 'glitch',      label: 'Glitch',       emoji: '📺', desc: 'Efecto glitch retro' },
    { id: 'fire',        label: 'Fire',         emoji: '🔥', desc: 'Llamas ascendentes' },
    { id: 'chrome',      label: 'Chrome',       emoji: '🪙', desc: 'Metálico plateado' },
    { id: 'electric',    label: 'Electric',     emoji: '🟡', desc: 'Shimmer dorado eléctrico' },
    { id: 'cosmic',      label: 'Cosmic',       emoji: '🌌', desc: 'Nebulosa estelar' },
    { id: 'matrix',      label: 'Matrix',       emoji: '💻', desc: 'Verde digital suave' },
    { id: 'wave',        label: 'Wave',         emoji: '🌊', desc: 'Olas cian-azul' },
    { id: 'pink-gamer',  label: 'Pink Gamer',   emoji: '💗', desc: 'Rosa gamer intenso' },
    { id: 'navidad',     label: 'Navidad',      emoji: '🎄', desc: 'Rojo, verde y dorado' },
    { id: 'ano-nuevo',   label: 'Año Nuevo',    emoji: '🎆', desc: 'Oro y plata brillante' },
]

const STEP_PX    = 10
const STEP_SCALE = 0.1
const MIN_SCALE  = 0.3
const MAX_SCALE  = 3.0

// ─── Hook reutilizable ──────────────────────────────────────────────────────
const useLayoutPanel = (tableId, rowId, defaults) => {
    const [layout, setLayout] = useState(defaults)
    const [saved,  setSaved]  = useState(defaults)
    const [loading, setLoading] = useState(true)

    const loadLayout = async () => {
        try {
            const { data, error } = await supabase
                .from(tableId).select('*').eq('id', rowId).single()
            if (!error && data) {
                const l = { 
                    pos_x: data.pos_x, 
                    pos_y: data.pos_y, 
                    scale: data.scale,
                    texto:  data.texto  !== undefined ? data.texto  : defaults.texto,
                    efecto: data.efecto !== undefined ? data.efecto : defaults.efecto,
                }
                if (l.texto  === undefined) delete l.texto
                if (l.efecto === undefined) delete l.efecto
                setLayout(l); setSaved(l)
            }
        } catch (_) {}
        finally { setLoading(false) }
    }

    useEffect(() => { loadLayout() }, [])

    const isDirty = layout.pos_x  !== saved.pos_x  ||
        layout.pos_y  !== saved.pos_y  ||
        Math.abs(layout.scale - saved.scale) > 0.001 ||
        layout.texto  !== saved.texto  ||
        layout.efecto !== saved.efecto

    const move = (axis, delta) =>
        setLayout(prev => ({ ...prev, [axis]: prev[axis] + delta }))
        
    const setText   = (newText)  => setLayout(prev => ({ ...prev, texto: newText }))
    const setEfecto = (newEfecto) => setLayout(prev => ({ ...prev, efecto: newEfecto }))

    const changeScale = (delta) => setLayout(prev => {
        const next = Math.round((prev.scale + delta) * 10) / 10
        return { ...prev, scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, next)) }
    })
    const reset = () => setLayout({ ...saved })
    const save = async () => {
        const payload = { id: rowId, pos_x: layout.pos_x, pos_y: layout.pos_y, scale: layout.scale }
        if (layout.texto  !== undefined) payload.texto  = layout.texto
        if (layout.efecto !== undefined) payload.efecto = layout.efecto
        
        const { error } = await supabase
            .from(tableId).upsert(payload, { onConflict: 'id' })
        if (error) throw error
        setSaved({ ...layout })
    }

    return { layout, loading, isDirty, move, changeScale, setText, setEfecto, reset, save }
}

// ─── Panel de controles (genérico) ─────────────────────────────────────────
// mode: 'left' | 'right' | 'center'
//   'left'   → pos_x = px from left, pos_y = offset from vertical center (px)
//   'right'  → pos_x = px from right, pos_y = offset from vertical center (px)
//   'center' → pos_x = offset from horizontal center (px), pos_y = offset from vertical center (px)
const PanelControls = ({
    title, previewLabel, layout, isDirty, saving,
    move, changeScale, onTextChange, onEffectChange, onSave, onResetRequest,
    mode = 'left', step = STEP_PX
}) => {
    const pW = 240, pH = 140
    const dotW = Math.max(16, Math.min(pW - 8, 56 * layout.scale))
    const dotH = Math.max(12, Math.min(pH - 8, 44 * layout.scale))

    let previewX, previewY
    if (mode === 'center') {
        // Center position = half of box - half of dot + scaled layout offset
        previewX = pW / 2 - dotW / 2 + (layout.pos_x / 1920) * pW
        previewY = pH / 2 - dotH / 2 + (layout.pos_y / 1080) * pH
        
        // Clamp to prevent dot escaping the box entirely
        previewX = Math.max(0, Math.min(pW - dotW, previewX))
        previewY = Math.max(0, Math.min(pH - dotH, previewY))
    } else if (mode === 'right') {
        previewX = Math.max(0, Math.min(pW - dotW, pW - dotW - (layout.pos_x / 1920) * pW))
        previewY = Math.max(0, Math.min(pH - dotH, pH / 2 + (layout.pos_y / 1080) * pH - dotH / 2))
    } else {
        previewX = Math.max(0, Math.min(pW - dotW, (layout.pos_x / 1920) * pW))
        previewY = Math.max(0, Math.min(pH - dotH, pH / 2 + (layout.pos_y / 1080) * pH - dotH / 2))
    }

    // For 'right' panel: ▶ = move right on screen = decrease pos_x
    const handleMoveX = (visualDir) => {
        // visualDir: +1 = move right, -1 = move left
        if (mode === 'right') move('pos_x', -visualDir * step)
        else move('pos_x', visualDir * step)
    }

    const xLabel = mode === 'right' ? 'Desde der' : mode === 'center' ? 'X offset' : 'Desde izq'
    const yLabel = 'Y offset'
    const xValue = mode === 'center' ? `${layout.pos_x > 0 ? '+' : ''}${layout.pos_x}px` : `${layout.pos_x}px`
    const yValue = `${layout.pos_y > 0 ? '+' : ''}${layout.pos_y}px`
    const hint   = mode === 'center'
        ? `Cada clic mueve ${step}px — (0,0) es el centro exacto`
        : `Cada clic mueve ${step}px — Y=0 es el centro`

    return (
        <div className="gda-panel-section">
            <h3 className="gda-section-title">{title}</h3>

            {/* Vista previa */}
            <div className="gda-card">
                <h4 className="gda-card-title">Vista previa</h4>
                <div className="gda-preview-screen" style={{ width: pW, height: pH }}>
                    <div className="gda-preview-dot" style={{ width: dotW, height: dotH, left: previewX, top: previewY }}>
                        <span className="gda-preview-label">{previewLabel}</span>
                    </div>
                </div>
                <div className="gda-coords">
                    <span>{xLabel}: <strong>{xValue}</strong></span>
                    <span>{yLabel}: <strong>{yValue}</strong></span>
                    <span>Escala: <strong>{layout.scale.toFixed(1)}×</strong></span>
                </div>
            </div>

            {/* D-pad + Escala */}
            <div className="gda-controls-grid">
                <div className="gda-card">
                    <h4 className="gda-card-title">📍 Posición</h4>
                    <div className="gda-dpad">
                        <div /><button className="gda-dir-btn" onClick={() => move('pos_y', -step)}>▲</button><div />
                        <button className="gda-dir-btn" onClick={() => handleMoveX(-1)}>◀</button>
                        <div className="gda-dpad-center">✛</div>
                        <button className="gda-dir-btn" onClick={() => handleMoveX(+1)}>▶</button>
                        <div /><button className="gda-dir-btn" onClick={() => move('pos_y', step)}>▼</button><div />
                    </div>
                    <p className="gda-hint">{hint}</p>
                </div>

                <div className="gda-card">
                    <h4 className="gda-card-title">🔍 Escala</h4>
                    <div className="gda-scale-controls">
                        <button className="gda-scale-btn" onClick={() => changeScale(-STEP_SCALE)} disabled={layout.scale <= MIN_SCALE}>−</button>
                        <div className="gda-scale-display">
                            <span className="gda-scale-val">{layout.scale.toFixed(1)}</span>
                            <span className="gda-scale-lbl">×</span>
                        </div>
                        <button className="gda-scale-btn" onClick={() => changeScale(STEP_SCALE)} disabled={layout.scale >= MAX_SCALE}>+</button>
                    </div>
                    <div className="gda-scale-bar-wrap">
                        <div className="gda-scale-bar-fill" style={{ width: `${((layout.scale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * 100}%` }} />
                    </div>
                    <p className="gda-hint">Rango: {MIN_SCALE}× – {MAX_SCALE}×</p>
                </div>
            </div>
            
            {onTextChange && (
                <div className="gda-card gda-text-control-card" style={{ marginTop: '15px' }}>
                    <h4 className="gda-card-title">📝 Texto a mostrar</h4>
                    <textarea 
                        className="gu-input" 
                        value={layout.texto} 
                        onChange={(e) => onTextChange(e.target.value)}
                        style={{ width: '100%', marginTop: '5px', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }}
                        rows="3"
                    />
                </div>
            )}

            {onEffectChange && (
                <div className="gda-card" style={{ marginTop: '15px' }}>
                    <h4 className="gda-card-title">✨ Efecto visual de las letras</h4>
                    <div className="gda-effects-grid">
                        {TEXT_EFFECTS.map(fx => (
                            <button
                                key={fx.id}
                                className={`gda-effect-card ${layout.efecto === fx.id ? 'active' : ''}`}
                                onClick={() => onEffectChange(fx.id)}
                                title={fx.desc}
                            >
                                <span className="gda-effect-emoji">{fx.emoji}</span>
                                <span
                                    className={`gda-effect-preview text-effect-${fx.id}`}
                                    data-text={fx.label}
                                >
                                    {fx.label}
                                </span>
                                <span className="gda-effect-desc">{fx.desc}</span>
                                {layout.efecto === fx.id && <span className="gda-effect-check">✓</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Acciones */}
            <div className="gda-actions">
                {isDirty && (
                    <span className="gda-unsaved-badge">● cambios sin guardar</span>
                )}
                <button
                    className="gda-btn-reset"
                    onClick={onResetRequest}
                    disabled={!isDirty || saving}
                    title="Revertir todos los cambios al último estado guardado"
                >
                    ↩ Deshacer
                </button>
                <button
                    className={`gda-btn-save ${isDirty ? 'gda-btn-save--active' : ''}`}
                    onClick={onSave}
                    disabled={!isDirty || saving}
                    title="Guardar cambios en Supabase"
                >
                    {saving ? '⏳ Guardando…' : '💾 Guardar cambios'}
                </button>
            </div>
        </div>
    )
}

// ─── Página principal ────────────────────────────────────────────────────────
const GestorDisplayAdmin = () => {
    const [saving,       setSaving]       = useState(false)
    const [confirm,      setConfirm]      = useState(null)
    const [resetConfirm, setResetConfirm] = useState(null)
    const [toast,        setToast]        = useState(null)

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const qr      = useLayoutPanel('display_qr_layout',      QR_LAYOUT_ID,      DEFAULT_QR)
    const sorteos = useLayoutPanel('display_sorteos_layout',  SORTEOS_LAYOUT_ID, DEFAULT_SORTEOS)
    const logo    = useLayoutPanel('display_logo_layout',     LOGO_LAYOUT_ID,    DEFAULT_LOGO)
    const texto   = useLayoutPanel('display_text_layout',     TEXT_LAYOUT_ID,    DEFAULT_TEXT)

    const loading = qr.loading || sorteos.loading || logo.loading || texto.loading

    const handleConfirm = async () => {
        setSaving(true)
        try {
            await confirm.saveFn()
            showToast('✅ Cambios guardados correctamente.')
        } catch (e) {
            showToast('❌ Error al guardar: ' + e.message, 'error')
        } finally {
            setSaving(false)
            setConfirm(null)
        }
    }

    const handleReset = () => {
        resetConfirm.resetFn()
        setResetConfirm(null)
        showToast('↩ Cambios revertidos al último guardado.', 'warn')
    }

    const panelNames = { 
        qr: 'QR (WhatsApp / WiFi)', 
        sorteos: 'Sorteos / Ganadores', 
        logo: 'Logo Arcadia',
        texto: 'Texto Luminoso' 
    }

    return (
        <div className="gda-page">
            {toast && (
                <div className={`gda-toast ${toast.type === 'error' ? 'gda-toast-error' : 'gda-toast-success'}`}>
                    {toast.msg}
                </div>
            )}

            {/* ── Diálogo: GUARDAR ── */}
            {confirm && (
                <div className="gda-overlay" onClick={() => !saving && setConfirm(null)}>
                    <div className="gda-dialog gda-dialog--save" onClick={e => e.stopPropagation()}>
                        <div className="gda-dialog-icon">💾</div>
                        <h3 className="gda-dialog-title">Guardar cambios</h3>
                        <p className="gda-dialog-body">
                            ¿Aplicar los cambios al panel de{' '}
                            <strong className="gda-dialog-panel-name">{panelNames[confirm.panel]}</strong>?
                            <br />
                            <span className="gda-dialog-hint">Esta acción actualizará la pantalla en tiempo real.</span>
                        </p>
                        <div className="gda-dialog-actions">
                            <button className="gda-btn-cancel" onClick={() => setConfirm(null)} disabled={saving}>
                                Cancelar
                            </button>
                            <button className="gda-btn-confirm gda-btn-confirm--save" onClick={handleConfirm} disabled={saving}>
                                {saving ? '⏳ Guardando…' : '✅ Sí, guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Diálogo: DESHACER ── */}
            {resetConfirm && (
                <div className="gda-overlay" onClick={() => setResetConfirm(null)}>
                    <div className="gda-dialog gda-dialog--danger" onClick={e => e.stopPropagation()}>
                        <div className="gda-dialog-icon">↩</div>
                        <h3 className="gda-dialog-title gda-dialog-title--danger">Deshacer cambios</h3>
                        <p className="gda-dialog-body">
                            ¿Revertir todos los cambios del panel{' '}
                            <strong className="gda-dialog-panel-name--danger">{panelNames[resetConfirm.panel]}</strong>?
                            <br />
                            <span className="gda-dialog-hint">Se restaurará el último estado guardado en Supabase.</span>
                        </p>
                        <div className="gda-dialog-actions">
                            <button className="gda-btn-cancel" onClick={() => setResetConfirm(null)}>
                                Cancelar
                            </button>
                            <button className="gda-btn-confirm gda-btn-confirm--danger" onClick={handleReset}>
                                ↩ Sí, deshacer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="gda-header-row">
                <div>
                    <h2 className="gda-title">🖥️ Administrador de Display</h2>
                    <p className="gda-subtitle">Ajusta posición y escala de los paneles en la pantalla cliente.</p>
                </div>
            </div>

            {loading ? (
                <div className="gda-loading">Cargando configuración...</div>
            ) : (
                <div className="gda-two-panels">
                    {/* Panel QR */}
                    <PanelControls
                        title="📶 Panel QR — WhatsApp / WiFi (lado izquierdo)"
                        previewLabel="QR"
                        layout={qr.layout}
                        isDirty={qr.isDirty}
                        saving={saving}
                        move={qr.move}
                        changeScale={qr.changeScale}
                        onResetRequest={() => setResetConfirm({ panel: 'qr', resetFn: qr.reset })}
                        onSave={() => setConfirm({ panel: 'qr', saveFn: qr.save })}
                        mode="left"
                        step={STEP_PX}
                    />

                    <div className="gda-divider" />

                    {/* Panel Sorteos */}
                    <PanelControls
                        title="🎯 Panel Sorteos / Ganadores (lado derecho)"
                        previewLabel="🏆"
                        layout={sorteos.layout}
                        isDirty={sorteos.isDirty}
                        saving={saving}
                        move={sorteos.move}
                        changeScale={sorteos.changeScale}
                        onResetRequest={() => setResetConfirm({ panel: 'sorteos', resetFn: sorteos.reset })}
                        onSave={() => setConfirm({ panel: 'sorteos', saveFn: sorteos.save })}
                        mode="right"
                        step={STEP_PX}
                    />

                    <div className="gda-divider" />

                    {/* Panel Logo */}
                    <PanelControls
                        title="🏷️ Logo Arcadia (posición libre)"
                        previewLabel="⬡"
                        layout={logo.layout}
                        isDirty={logo.isDirty}
                        saving={saving}
                        move={logo.move}
                        changeScale={logo.changeScale}
                        onResetRequest={() => setResetConfirm({ panel: 'logo', resetFn: logo.reset })}
                        onSave={() => setConfirm({ panel: 'logo', saveFn: logo.save })}
                        mode="center"
                        step={STEP_PX}
                    />

                    <div className="gda-divider" />

                    {/* Panel Texto */}
                    <PanelControls
                        title="✨ Texto Luminoso (GAMING CENTER ARCADIA)"
                        previewLabel="T"
                        layout={texto.layout}
                        isDirty={texto.isDirty}
                        saving={saving}
                        move={texto.move}
                        changeScale={texto.changeScale}
                        onTextChange={texto.setText}
                        onEffectChange={texto.setEfecto}
                        onResetRequest={() => setResetConfirm({ panel: 'texto', resetFn: texto.reset })}
                        onSave={() => setConfirm({ panel: 'texto', saveFn: texto.save })}
                        mode="center"
                        step={STEP_PX}
                    />
                </div>
            )}
        </div>
    )
}

export default GestorDisplayAdmin
