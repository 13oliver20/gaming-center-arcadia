import React from 'react'

/**
 * Normaliza texto para comparaciones sin acentos y en minúsculas.
 */
export const normalizeText = (str) =>
    (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()

/**
 * Sistema de puntuación para ranking maestro de relevancia:
 * Prioriza fuertemente el nombre de usuario (@nickname) sobre el nombre real.
 */
export const scoreUser = (user, query) => {
    const q = normalizeText(query).replace(/^@/, '')
    if (!q) return 0

    const nick = normalizeText(user.nickname)
    const name = normalizeText(user.nombre_real)

    let score = 0

    // 1. Coincidencias en Nickname (Máxima prioridad)
    if (nick === q) {
        score += 1000
    } else if (nick.startsWith(q)) {
        score += 800
    } else if (nick.split(/[_\-\s.]+/).some(w => w.startsWith(q))) {
        score += 650
    } else if (nick.includes(q)) {
        score += 500
    }

    // 2. Coincidencias en Nombre Real (Prioridad secundaria)
    if (name === q) {
        score += 400
    } else if (name.startsWith(q)) {
        score += 350
    } else if (name.split(/\s+/).some(w => w.startsWith(q))) {
        score += 250
    } else if (name.includes(q)) {
        score += 100
    }

    // Pequeño bono de longitud: a más corto el nickname, más exacta es la intención
    if (score > 0 && nick) {
        score += Math.max(0, 30 - nick.length)
    }

    return score
}

/**
 * Busca y ordena una lista de usuarios usando el motor de scoring.
 */
export const searchUsersList = (users = [], query = '', limit = 10) => {
    const q = (query || '').trim().replace(/^@/, '')
    if (!q) {
        // Por defecto: ordenados alfabéticamente por @nickname
        return [...users]
            .sort((a, b) => (a.nickname || '').localeCompare(b.nickname || ''))
            .slice(0, limit)
    }

    const scored = []
    for (let i = 0; i < users.length; i++) {
        const u = users[i]
        const sc = scoreUser(u, q)
        if (sc > 0) {
            scored.push({ user: u, score: sc })
        }
    }

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return (a.user.nickname || '').localeCompare(b.user.nickname || '')
    })

    return scored.slice(0, limit).map(item => item.user)
}

/**
 * Resalta la coincidencia de búsqueda dentro de un texto.
 */
export const highlightMatch = (text = '', query = '') => {
    const q = (query || '').trim().replace(/^@/, '')
    if (!q || !text) return text

    const normText = normalizeText(text)
    const normQ = normalizeText(q)
    const idx = normText.indexOf(normQ)

    if (idx === -1) return text

    const before = text.slice(0, idx)
    const match = text.slice(idx, idx + normQ.length)
    const after = text.slice(idx + normQ.length)

    return (
        <>
            {before}
            <mark className="search-match-mark">{match}</mark>
            {after}
        </>
    )
}
