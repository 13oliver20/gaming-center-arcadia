/**
 * peruTime.js
 * Utilidades centralizadas para asegurar la zona horaria GMT-5 (América/Lima, Perú)
 * en todo el sistema Gaming Center Arcadia.
 */

export const PERU_TIMEZONE = 'America/Lima'

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const DIAS_MAP = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/**
 * Desglosa una fecha en sus componentes en la zona horaria de Perú (GMT-5).
 */
export const getPeruDateParts = (date = new Date()) => {
    const validDate = date instanceof Date && !isNaN(date) ? date : new Date(date)
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: PERU_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    })

    const parts = formatter.formatToParts(validDate)
    const p = {}
    parts.forEach(({ type, value }) => { p[type] = value })

    return {
        year: parseInt(p.year, 10),
        month: parseInt(p.month, 10),
        day: parseInt(p.day, 10),
        hour: parseInt(p.hour, 10),
        minute: parseInt(p.minute, 10),
        second: parseInt(p.second, 10)
    }
}

/**
 * Retorna la fecha actual en Perú en formato 'YYYY-MM-DD'
 */
export const getPeruDateStr = (date = new Date()) => {
    const { year, month, day } = getPeruDateParts(date)
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Retorna la fecha actual en Perú en formato legible 'DD/MM/YYYY'
 */
export const getPeruFormattedDate = (date = new Date()) => {
    const { year, month, day } = getPeruDateParts(date)
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/**
 * Retorna la letra del día de la semana en Perú: 'L', 'M', 'X', 'J', 'V', 'S', 'D'
 */
export const getPeruDayChar = (date = new Date()) => {
    const { year, month, day } = getPeruDateParts(date)
    // Usar UTC al mediodía para evitar cualquier salto de huso horario
    const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
    return DIAS_MAP[utcNoon.getUTCDay()]
}

/**
 * Retorna el rango exacto de inicio y fin del mes en Perú (GMT-5).
 * - startIso: 1er día del mes a las 00:00:00.000 Lima (05:00:00 UTC)
 * - endIso: Último día del mes a las 23:59:59.999 Lima (04:59:59.999 UTC del 1er día del siguiente mes)
 */
export const getPeruMonthRange = (date = new Date()) => {
    const { year, month } = getPeruDateParts(date)
    // 00:00:00 Lima = 05:00:00 UTC
    const startIso = new Date(Date.UTC(year, month - 1, 1, 5, 0, 0, 0)).toISOString()
    const nextMonthYear = month === 12 ? year + 1 : year
    const nextMonth = month === 12 ? 1 : month + 1
    // 23:59:59.999 Lima = 04:59:59.999 UTC del siguiente mes
    const endIso = new Date(Date.UTC(nextMonthYear, nextMonth - 1, 1, 4, 59, 59, 999)).toISOString()

    return {
        startIso,
        endIso,
        year,
        month,
        monthName: MESES[month - 1]
    }
}

/**
 * Retorna el nombre del mes dado su índice (0 = Enero, 11 = Diciembre).
 */
export const getPeruMonthName = (monthIndex) => {
    return MESES[monthIndex] || ''
}

/**
 * Formatea una fecha u hora ISO a formato amigable en hora de Lima.
 */
export const formatPeruDateTime = (isoOrDate, options = {}) => {
    if (!isoOrDate) return '—'
    const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
    if (isNaN(d)) return '—'
    return d.toLocaleString('es-PE', {
        timeZone: PERU_TIMEZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: options.includeSeconds ? '2-digit' : undefined,
        hour12: true,
        ...options
    })
}
