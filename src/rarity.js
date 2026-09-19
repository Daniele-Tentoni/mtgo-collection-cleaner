const CACHE_KEY = 'binder-cleaner:rarita:v1'
const ENDPOINT = 'https://api.scryfall.com/cards/collection'

export const RARITIES = [
    { id: 'common', label: 'Comune', color: '#a7b0bb' },
    { id: 'uncommon', label: 'Non comune', color: '#9cc9e4' },
    { id: 'rare', label: 'Rara', color: '#e3b93f' },
    { id: 'mythic', label: 'Mitica', color: '#e5692c' },
    { id: 'other', label: 'Altro', color: '#7a8596' }, // special, bonus, carte non trovate
]
export const rarityInfo = (rarity) => RARITIES.find((r) => r.id === rarity) ?? RARITIES[4]

const readCache = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {} } catch { return {} }
}
const writeCache = (cache) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch { /* cache non disponibile */ }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const chunks = (list, size = 75) =>
    Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))

async function lookup(identifiers) {
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ identifiers }),
    })
    if (!res.ok) throw new Error(`Scryfall ha risposto con errore ${res.status}`)
    return (await res.json()).data
}

/** cards: [{ catId, name }] senza duplicati. Restituisce { [catId]: rarità }. */
export async function fetchRarities(cards, onProgress = () => { }) {
    const cache = readCache()
    const todo = cards.filter((c) => !(c.catId in cache))
    let done = 0

    // 1) per CatID
    for (const batch of chunks(todo)) {
        for (const card of await lookup(batch.map((c) => ({ mtgo_id: Number(c.catId) })))) {
            cache[String(card.mtgo_id)] = card.rarity
        }
        writeCache(cache)
        onProgress((done += batch.length), todo.length)
        await sleep(100) // Scryfall raccomanda al massimo ~10 richieste al secondo
    }

    // 2) fallback per nome (foil e stampe senza mtgo_id): rarità di una stampa qualsiasi
    const missed = [...new Map(todo.filter((c) => !(c.catId in cache)).map((c) => [c.name, c])).values()]
    const byName = {}
    for (const batch of chunks(missed)) {
        for (const card of await lookup(batch.map((c) => ({ name: c.name })))) byName[card.name] = card.rarity
        await sleep(100)
    }
    for (const c of todo) if (!(c.catId in cache)) cache[c.catId] = byName[c.name] ?? 'unknown'
    writeCache(cache)

    return Object.fromEntries(cards.map((c) => [c.catId, cache[c.catId]]))
}