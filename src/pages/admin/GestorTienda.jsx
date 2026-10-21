import React, { useState, useEffect } from 'react'
import './GestorTienda.css'
import ProductoUploader from '../../components/ProductoUploader'
import { supabase } from '../../supabaseClient'

const CATEGORIAS = [
    {
        id: 'perifericos',
        icon: '🖱️',
        label: 'Periféricos',
        color: '#00e5ff',
        subcategorias: [
            { id: 'teclado', icon: '⌨️', label: 'Teclado' },
            { id: 'mouse', icon: '🖱️', label: 'Mouse' },
            { id: 'audifono', icon: '🎧', label: 'Audífono' },
        ],
    },
    {
        id: 'componentes',
        icon: '🖥️',
        label: 'PC Componentes',
        color: '#ff4eb8',
        subcategorias: [
            { id: 'placa', icon: '🔌', label: 'Placa Madre' },
            { id: 'cpu', icon: '⚙️', label: 'CPU' },
            { id: 'gpu', icon: '🎮', label: 'Tarjeta de Video' },
            { id: 'ram', icon: '💾', label: 'Memoria RAM' },
            { id: 'monitor', icon: '🖥️', label: 'Monitor' },
            { id: 'fuente', icon: '⚡', label: 'Fuente de Poder' },
        ],
    },
    {
        id: 'mobiliario',
        icon: '🪑',
        label: 'Mobiliario',
        color: '#ffd600',
        subcategorias: [
            { id: 'sillas', icon: '🪑', label: 'Sillas' },
            { id: 'mob_otros', icon: '📦', label: 'Otros' },
        ],
    },
    {
        id: 'otros',
        icon: '📦',
        label: 'Otros',
        color: '#00e676',
        subcategorias: [],
    },
]

const GestorTienda = () => {
    const [activeCat, setActiveCat] = useState(null)
    const [activeSub, setActiveSub] = useState(null)
    const [tiendaVisible, setTiendaVisible] = useState(true)
    const [toggleLoading, setToggleLoading] = useState(true)

    // Cargar estado inicial y suscribirse a cambios en tiempo real
    useEffect(() => {
        if (!supabase) {
            setToggleLoading(false)
            return
        }

        // Leer valor inicial
        const fetchConfig = async () => {
            const { data } = await supabase
                .from('display_config')
                .select('value')
                .eq('key', 'tienda_visible')
                .single()
            if (data != null) setTiendaVisible(data.value)
            setToggleLoading(false)
        }
        fetchConfig()

        // Escuchar broadcast (por si otro admin cambia el toggle)
        const channel = supabase
            .channel('tienda-display-broadcast')
            .on('broadcast', { event: 'tienda_visibility_update' }, (msg) => {
                if (msg.payload != null && typeof msg.payload.value === 'boolean') {
                    setTiendaVisible(msg.payload.value)
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const handleToggle = async () => {
        if (!supabase || toggleLoading) return
        const newValue = !tiendaVisible
        setTiendaVisible(newValue)

        // Guardar en Supabase
        await supabase
            .from('display_config')
            .update({ value: newValue })
            .eq('key', 'tienda_visible')

        // Emitir broadcast para actualizar /display en tiempo real
        await supabase
            .channel('tienda-display-broadcast')
            .send({
                type: 'broadcast',
                event: 'tienda_visibility_update',
                payload: { value: newValue },
            })
    }

    const handleCat = (id) => {
        setActiveCat(prev => prev === id ? null : id)
        setActiveSub(null)
    }

    const handleSub = (id) => {
        setActiveSub(prev => prev === id ? null : id)
    }

    const cat = CATEGORIAS.find(c => c.id === activeCat)

    return (
        <div className="gt-page">
            {/* Header */}
            <div className="gt-header">
                <h2 className="gt-title">🛒 Tienda</h2>
                <p className="gt-subtitle">Gestiona los periféricos y productos gamer disponibles para los clientes.</p>
            </div>

            {/* Panel de control del display */}
            <div className="gt-display-control">
                <div className="gt-display-control-left">
                    <div className="gt-display-control-icon">🎮</div>
                    <div className="gt-display-control-info">
                        <span className="gt-display-control-title">Icono en Pantalla</span>
                        <span className="gt-display-control-desc">
                            {tiendaVisible
                                ? 'El icono de Tienda es visible en /display'
                                : 'El icono de Tienda está oculto en /display'}
                        </span>
                    </div>
                </div>
                <div className="gt-display-control-right">
                    <span className={`gt-toggle-label ${tiendaVisible ? 'on' : 'off'}`}>
                        {toggleLoading ? '...' : tiendaVisible ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                    <button
                        className={`gt-toggle ${tiendaVisible ? 'on' : 'off'} ${toggleLoading ? 'loading' : ''}`}
                        onClick={handleToggle}
                        disabled={toggleLoading}
                        aria-label="Toggle visibilidad tienda en display"
                    >
                        <span className="gt-toggle-thumb" />
                    </button>
                </div>
            </div>

            {/* Category buttons */}
            <div className="gt-cats">
                {CATEGORIAS.map(c => (
                    <button
                        key={c.id}
                        className={`gt-cat-btn ${activeCat === c.id ? 'active' : ''}`}
                        style={{ '--cat-color': c.color }}
                        onClick={() => handleCat(c.id)}
                    >
                        <span className="gt-cat-icon">{c.icon}</span>
                        <span className="gt-cat-label">{c.label}</span>
                        <span className="gt-cat-arrow">{activeCat === c.id ? '▲' : '▼'}</span>
                    </button>
                ))}
            </div>

            {/* Subcategory panel */}
            {cat && (
                <div className="gt-sub-panel" style={{ '--cat-color': cat.color }}>
                    {cat.subcategorias.length === 0 ? (
                        <div className="gt-content-area" style={{ marginTop: '20px' }}>
                            <ProductoUploader
                                categoria={cat.label}
                                subcategoria="General"
                                accentColor={cat.color}
                            />
                        </div>
                    ) : (
                        <div className="gt-subs">
                            {cat.subcategorias.map(s => (
                                <button
                                    key={s.id}
                                    className={`gt-sub-btn ${activeSub === s.id ? 'active' : ''}`}
                                    style={{ '--cat-color': cat.color }}
                                    onClick={() => handleSub(s.id)}
                                >
                                    <span className="gt-sub-icon">{s.icon}</span>
                                    <span>{s.label}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Uploader for selected subcategory */}
                    {activeSub && (
                        <div className="gt-content-area">
                            <ProductoUploader
                                categoria={cat.label}
                                subcategoria={cat.subcategorias.find(s => s.id === activeSub)?.label}
                                accentColor={cat.color}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default GestorTienda
