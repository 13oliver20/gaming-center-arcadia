import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import './TiendaModal.css'

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

const TiendaModal = ({ isOpen, onClose }) => {
    const [expandedCat, setExpandedCat] = useState('perifericos')
    const [selectedSub, setSelectedSub] = useState({
        catLabel: 'Periféricos',
        subLabel: 'Teclado',
        color: '#00e5ff'
    })
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)
    const [currentIndex, setCurrentIndex] = useState(0)

    // Esc para cerrar modal, Flechas para navegar imagen actual
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose()
            if (items.length > 1) {
                if (e.key === 'ArrowLeft') {
                    setCurrentIndex(prev => prev > 0 ? prev - 1 : items.length - 1)
                }
                if (e.key === 'ArrowRight') {
                    setCurrentIndex(prev => prev < items.length - 1 ? prev + 1 : 0)
                }
            }
        }
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown)
        }
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose, items.length])

    const fetchItems = useCallback(async () => {
        if (!selectedSub) return
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('tienda_productos')
                .select('*')
                .eq('categoria', selectedSub.catLabel)
                .eq('subcategoria', selectedSub.subLabel)
                .order('orden', { ascending: true })

            if (error) throw error
            setItems(data || [])
            setCurrentIndex(0) // Reiniciar índice al cambiar de subcategoría
        } catch (e) {
            console.error('Error cargando imágenes tienda:', e.message)
            setItems([])
        } finally {
            setLoading(false)
        }
    }, [selectedSub])

    // Disparar carga de imágenes cuando cambie la subcategoría seleccionada
    useEffect(() => {
        if (isOpen && selectedSub) {
            fetchItems()
        }
    }, [isOpen, selectedSub, fetchItems])

    if (!isOpen) return null

    return (
        <div className="tienda-modal-overlay" onClick={onClose}>
            <div
                className="tienda-modal-content"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Botón de cerrar */}
                <button className="tienda-modal-close" onClick={onClose} aria-label="Cerrar tienda">
                    ✕
                </button>

                {/* Container Principal Dividido */}
                <div className="tienda-modal-layout">

                    {/* SIDEBAR IZQUIERDA */}
                    <div className="tienda-sidebar">
                        {/* Logos Arcadia */}
                        <div className="ts-logo-container">
                            <img src="/logo_arcadia.png" alt="Logo Arcadia" className="ts-logo-main" />
                            <img src="/arcadia_gaming.png" alt="Arcadia Gaming Texto" className="ts-logo-text" />
                        </div>

                        {CATEGORIAS.map(cat => (
                            <div key={cat.id} className="ts-cat-group">
                                <button
                                    className={`ts-cat-btn ${expandedCat === cat.id ? 'expanded' : ''} ${cat.subcategorias.length === 0 && selectedSub?.catLabel === cat.label ? 'active' : ''}`}
                                    style={{ '--cat-color': cat.color }}
                                    onClick={() => {
                                        setExpandedCat(expandedCat === cat.id ? null : cat.id)
                                        if (cat.subcategorias.length === 0) {
                                            setSelectedSub({ catLabel: cat.label, subLabel: "General", color: cat.color })
                                        }
                                    }}
                                >
                                    <span className="ts-cat-icon">{cat.icon}</span>
                                    <span className="ts-cat-label">{cat.label}</span>
                                    {cat.subcategorias.length > 0 && (
                                        <span className="ts-cat-arrow">{expandedCat === cat.id ? '▲' : '▼'}</span>
                                    )}
                                </button>

                                {/* Subcategorías si está expandido */}
                                {expandedCat === cat.id && cat.subcategorias.length > 0 && (
                                    <div className="ts-sub-menu">
                                        {cat.subcategorias.map(sub => (
                                            <button
                                                key={sub.id}
                                                className={`ts-sub-btn ${selectedSub?.subLabel === sub.label ? 'active' : ''}`}
                                                style={{ '--cat-color': cat.color }}
                                                onClick={() => setSelectedSub({ catLabel: cat.label, subLabel: sub.label, color: cat.color })}
                                            >
                                                <span className="ts-sub-icon">{sub.icon}</span>
                                                <span className="ts-sub-label">{sub.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ÁREA PRINCIPAL DERECHA */}
                    <div className="tienda-main-area">
                        {/* Contenido principal según selección */}
                        <div className="tm-content">
                            {loading ? (
                                <div className="tm-loading">
                                    <div className="tm-spinner"></div>
                                    <p>Cargando inventario...</p>
                                </div>
                            ) : items.length === 0 ? (
                                <div className="tm-empty">
                                    <span>📦</span>
                                    <p>No hay artículos en esta categoría por el momento.</p>
                                </div>
                            ) : (
                                <div className="tm-carousel-container">
                                    {/* Botón Anterior */}
                                    {items.length > 1 && (
                                        <button
                                            className="tm-carousel-nav prev"
                                            onClick={() => setCurrentIndex(prev => prev > 0 ? prev - 1 : items.length - 1)}
                                        >
                                            ‹
                                        </button>
                                    )}

                                    {/* Imagen Central */}
                                    <div className="tm-carousel-main" style={{ '--tm-color': selectedSub.color }}>
                                        <div className="tm-main-img-wrap">
                                            <img
                                                key={items[currentIndex].id}
                                                src={items[currentIndex].url}
                                                alt={items[currentIndex].descripcion || 'Producto'}
                                            />
                                        </div>
                                        {items[currentIndex].descripcion && (
                                            <div className="tm-main-desc">
                                                <p>{items[currentIndex].descripcion}</p>
                                            </div>
                                        )}
                                        <div className="tm-carousel-counter">
                                            {currentIndex + 1} / {items.length}
                                        </div>
                                    </div>

                                    {/* Botón Siguiente */}
                                    {items.length > 1 && (
                                        <button
                                            className="tm-carousel-nav next"
                                            onClick={() => setCurrentIndex(prev => prev < items.length - 1 ? prev + 1 : 0)}
                                        >
                                            ›
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default TiendaModal
