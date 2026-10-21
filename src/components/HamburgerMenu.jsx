import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import './HamburgerMenu.css'

const menuItems = [
    { icon: '👥', label: 'Gestión de Usuarios', to: '/admin/usuarios' },
    { icon: '📲', label: 'Gestor de QRs', to: '/admin/qrs' },
    { icon: '🎰', label: 'Gestor de Sorteos Diarios', to: '/admin/sorteos' },
    { icon: '🏅', label: 'Gestor de Ganadores Mensuales', to: '/admin/ganadores-mensuales' },
    { icon: '📢', label: 'Anuncio', to: '/admin/anuncio' },
    { icon: '🛒', label: 'Tienda', to: '/admin/tienda' },
    { icon: '🎁', label: 'Beneficios Cliente', to: '/admin/beneficios' },
    { icon: '🖥️', label: 'Administrador de Display', to: '/admin/display' },
]

const HamburgerMenu = () => {
    const [isOpen, setIsOpen] = useState(false)

    const toggle = () => setIsOpen(v => !v)
    const close = () => setIsOpen(false)

    return (
        <div className="hamburger-wrapper">
            {/* Trigger button */}
            <button
                className={`hamburger-btn ${isOpen ? 'open' : ''}`}
                onClick={toggle}
                aria-label="Abrir menú"
                aria-expanded={isOpen}
            >
                <span className="bar bar1" />
                <span className="bar bar2" />
                <span className="bar bar3" />
            </button>

            {/* Dropdown panel */}
            <nav className={`dropdown-menu ${isOpen ? 'visible' : ''}`} aria-hidden={!isOpen}>
                <div className="dropdown-header">
                    <span className="dropdown-header-icon">🖥️</span>
                    <span className="dropdown-header-label">Pantalla Cliente</span>
                </div>
                <ul>
                    {menuItems.map(item => (
                        <li key={item.to}>
                            <Link to={item.to} onClick={close}>
                                <span className="menu-icon">{item.icon}</span>
                                {item.label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* Overlay to close on outside click */}
            {isOpen && <div className="menu-overlay" onClick={close} />}
        </div>
    )
}

export default HamburgerMenu
