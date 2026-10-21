import React from 'react'
import HamburgerMenu from '../components/HamburgerMenu'
import SupabaseStatus from '../components/SupabaseStatus'
import './Admin.css'

const Admin = ({ children }) => {
    return (
        <div className="admin-page">
            <header className="admin-header">
                <div className="admin-header-left">
                    <HamburgerMenu />
                </div>
                <div className="admin-header-center">
                    <span className="admin-panel-icon">🎮</span>
                    <span className="admin-panel-title">
                        Panel de Administración
                        <span className="admin-panel-sub"> · Gaming Center Arcadia</span>
                    </span>
                </div>
                <div className="admin-header-right">
                    <SupabaseStatus />
                </div>
            </header>

            {/* Page content rendered here */}
            <main className="admin-content">
                {children}
            </main>
        </div>
    )
}

export default Admin
