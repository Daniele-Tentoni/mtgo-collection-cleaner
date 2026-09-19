const attr = (el, name) => el.getAttribute(name) ?? ''

/** Legge un .dek (XML) e restituisce l'elenco dei nodi <Cards>. */
export function parseDek(text, fileName = 'file') {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error(`"${fileName}" non è un file .dek valido (XML non leggibile).`)
  }
  const cards = [...doc.getElementsByTagName('Cards')].map((el) => ({
    catId: attr(el, 'CatID'),
    quantity: parseInt(attr(el, 'Quantity'), 10) || 0,
    sideboard: attr(el, 'Sideboard') === 'true',
    name: attr(el, 'Name'),
    annotation: attr(el, 'Annotation') || '0',
  }))
  if (!cards.length) throw new Error(`"${fileName}" non contiene carte.`)
  return cards
}

/**
 * Per ogni carta, da collezione si tolgono le copie che servono al mazzo che ne usa di più
 * (main + sideboard dello stesso mazzo sommati; tra mazzi diversi si prende il massimo).
 * byName = true: stampe diverse della stessa carta contano come la stessa carta.
 */
export function computeBinder(collection, decks, byName = false) {
  const keyOf = (c) => (byName ? c.name : c.catId)

  const needed = new Map() // chiave -> { name, qty }
  for (const deck of decks) {
    const perDeck = new Map()
    for (const c of deck) {
      const k = keyOf(c)
      const cur = perDeck.get(k) ?? { name: c.name, qty: 0 }
      cur.qty += c.quantity
      perDeck.set(k, cur)
    }
    for (const [k, { name, qty }] of perDeck) {
      const prev = needed.get(k)
      if (!prev || qty > prev.qty) needed.set(k, { name, qty })
    }
  }

  const remaining = new Map([...needed].map(([k, v]) => [k, v.qty]))
  const rows = collection.map((c, id) => {
    const k = keyOf(c)
    const used = Math.min(c.quantity, remaining.get(k) ?? 0)
    if (used) remaining.set(k, remaining.get(k) - used)
    return { ...c, id, used, left: c.quantity - used }
  })
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.catId.localeCompare(b.catId))

  const missing = [...remaining]
    .filter(([, q]) => q > 0)
    .map(([k, q]) => ({ name: needed.get(k).name, qty: q }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const sum = (f) => rows.reduce((n, r) => n + f(r), 0)
  return {
    rows,
    missing,
    totals: { owned: sum((r) => r.quantity), kept: sum((r) => r.used), sell: sum((r) => r.left) },
  }
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Genera il .dek del binder con le sole copie rimaste in vendita. */
export function buildDek(rows) {
  const cards = rows
    .filter((r) => r.left > 0)
    .map(
      (r) =>
        `  <Cards CatID="${esc(r.catId)}" Quantity="${r.left}" Sideboard="${r.sideboard}" Name="${esc(r.name)}" Annotation="${esc(r.annotation)}" />`,
    )
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<Deck xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <NetDeckID>0</NetDeckID>',
    '  <PreconstructedDeckID>0</PreconstructedDeckID>',
    ...cards,
    '</Deck>',
    '',
  ].join('\n')
}
