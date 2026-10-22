import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabaseClient'
import './SupabaseStatus.css'

const STATUS = {
    CHECKING: 'checking',
    CONNECTED: 'connected',
    ERROR: 'error',
    UNCONFIGURED: 'unconfigured',
}

export default function SupabaseStatus() {
    const [status, setStatus] = useState(STATUS.CHECKING)
    const [latency, setLatency] = useState(null)
    const [lastChecked, setLastChecked] = useState(null)
    const [tooltip, setTooltip] = useState(false)
    const intervalRef = useRef(null)

    const checkConnection = useCallback(async () => {
        if (!supabase) {
            setStatus(STATUS.UNCONFIGURED)
            setLatency(null)
            return
        }

        setStatus(STATUS.CHECKING)
        const start = performance.now()

        try {
            // auth.getSession() usa almacenamiento local/memoria.
            // No hace ninguna petición HTTP externa; solo verifica
            // si el cliente de Supabase responde y está inicializado.
            const { error } = await supabase.auth.getSession()
            const ms = Math.round(performance.now() - start)
            setLatency(ms)
            setStatus(error ? STATUS.ERROR : STATUS.CONNECTED)
        } catch {
            setStatus(STATUS.ERROR)
            setLatency(null)
        }

        setLastChecked(new Date())
    }, [])

    // Revisión inicial + polling cada 30 segundos
    useEffect(() => {
        checkConnection()
        intervalRef.current = setInterval(checkConnection, 30_000)

        // Detecta cuando el navegador recupera/pierde red
        const handleOnline  = () => checkConnection()
        const handleOffline = () => setStatus(STATUS.ERROR)

        window.addEventListener('online',  handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            clearInterval(intervalRef.current)
            window.removeEventListener('online',  handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [checkConnection])

    const config = {
        [STATUS.CHECKING]: {
            label: 'Verificando…',
            dot: 'dot-checking',
            badge: 'badge-checking',
            icon: '⟳',
        },
        [STATUS.CONNECTED]: {
            label: 'Conectado',
            dot: 'dot-connected',
            badge: 'badge-connected',
            icon: '●',
        },
        [STATUS.ERROR]: {
            label: 'Sin conexión',
            dot: 'dot-error',
            badge: 'badge-error',
            icon: '●',
        },
        [STATUS.UNCONFIGURED]: {
            label: 'No configurado',
            dot: 'dot-error',
            badge: 'badge-error',
            icon: '⚠',
        },
    }

    const { label, dot, badge, icon } = config[status]

    const timeStr = lastChecked
        ? lastChecked.toLocaleTimeString('es-PE', {
              timeZone: 'America/Lima',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
          })
        : '—'

    return (
        <div
            className={`sbs-wrapper ${badge}`}
            onMouseEnter={() => setTooltip(true)}
            onMouseLeave={() => setTooltip(false)}
            onClick={checkConnection}
            role="status"
            aria-label={`Supabase: ${label}`}
            title="Haz clic para verificar ahora"
        >
            <span className={`sbs-dot ${dot}`} aria-hidden="true" />
            <span className="sbs-icon" aria-hidden="true">{icon}</span>
            <span className="sbs-label">DB · {label}</span>
            {latency !== null && status === STATUS.CONNECTED && (
                <span className="sbs-latency">{latency}ms</span>
            )}

            {tooltip && (
                <div className="sbs-tooltip" role="tooltip">
                    <div className="sbs-tooltip-row">
                        <span className="sbs-tooltip-key">Estado</span>
                        <span
                            className={`sbs-tooltip-val ${
                                status === STATUS.CONNECTED ? 'val-ok' : 'val-err'
                            }`}
                        >
                            {label}
                        </span>
                    </div>
                    {latency !== null && (
                        <div className="sbs-tooltip-row">
                            <span className="sbs-tooltip-key">Latencia</span>
                            <span className="sbs-tooltip-val">{latency} ms</span>
                        </div>
                    )}
                    <div className="sbs-tooltip-row">
                        <span className="sbs-tooltip-key">Última revisión</span>
                        <span className="sbs-tooltip-val">{timeStr}</span>
                    </div>
                    <div className="sbs-tooltip-row">
                        <span className="sbs-tooltip-key">Intervalo</span>
                        <span className="sbs-tooltip-val">cada 30 s</span>
                    </div>
                    <div className="sbs-tooltip-hint">Clic para revisar ahora</div>
                </div>
            )}
        </div>
    )
}
