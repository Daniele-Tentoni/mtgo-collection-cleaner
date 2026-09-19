<script setup>
import { computed, ref, watch } from 'vue'
import DropZone from './components/DropZone.vue'
import { buildDek, computeBinder, parseDek } from './dek'
import { fetchRarities, RARITIES, rarityInfo } from './rarity'

const collection = ref(null) // { name, cards }
const decks = ref([]) // [{ name, cards }]
const byName = ref(false)
const view = ref('all')
const search = ref('')
const error = ref('')

const load = async (file) => ({ name: file.name, cards: parseDek(await file.text(), file.name) })
const count = (cards) => cards.reduce((n, c) => n + c.quantity, 0)

async function onCollection([file]) {
  try {
    collection.value = await load(file)
    error.value = ''
  } catch (e) {
    error.value = e.message
  }
}

async function onDecks(files) {
  error.value = ''
  for (const file of files) {
    try {
      const deck = await load(file)
      decks.value = [...decks.value.filter((d) => d.name !== deck.name), deck]
    } catch (e) {
      error.value = e.message
    }
  }
}

const removeDeck = (name) => (decks.value = decks.value.filter((d) => d.name !== name))

const result = computed(
  () => collection.value && computeBinder(collection.value.cards, decks.value.map((d) => d.cards), byName.value),
)

const delta = ref({}) // id riga -> variazione manuale rispetto al calcolo dai mazzi

// se cambiano collezione, mazzi od opzione, il calcolo di base cambia: le modifiche manuali ripartono da zero
watch([collection, decks, byName], () => (delta.value = {}))

const rarities = ref({}) // catId -> rarità
const rarityStatus = ref('idle') // idle | loading | ok | error
const rarityProgress = ref('')
const rarityError = ref('')
const rarityFilter = ref([]) // rarità selezionate; vuoto = tutte

async function loadRarities() {
  const col = collection.value
  if (!col) return
  rarityStatus.value = 'loading'
  rarityProgress.value = ''
  try {
    const unique = [...new Map(col.cards.map((c) => [c.catId, c])).values()]
    const map = await fetchRarities(unique, (done, total) => (rarityProgress.value = `${done}/${total}`))
    if (collection.value !== col) return // nel frattempo hai caricato un'altra collezione
    rarities.value = map
    rarityStatus.value = 'ok'
  } catch (e) {
    if (collection.value !== col) return
    rarityStatus.value = 'error'
    rarityError.value = e.message
  }
}

watch(collection, () => {
  rarities.value = {}
  rarityFilter.value = []
  loadRarities()
})

function toggleRarity(id) {
  const i = rarityFilter.value.indexOf(id)
  if (i === -1) rarityFilter.value.push(id)
  else rarityFilter.value.splice(i, 1)
}

// righe finali: quantità da esportare = base + variazione, sempre tra 0 e la quantità in collezione
const rows = computed(() =>
  (result.value?.rows ?? []).map((r) => {
    const left = Math.min(r.quantity, Math.max(0, r.left + (delta.value[r.id] ?? 0)))
    return { ...r, baseLeft: r.left, left, rarity: rarities.value[r.catId] ?? null }
  }),
)

const totals = computed(() => {
  const owned = rows.value.reduce((n, r) => n + r.quantity, 0)
  const sell = rows.value.reduce((n, r) => n + r.left, 0)
  return { owned, sell, kept: owned - sell }
})

function adjust(row, step) {
  const next = row.left + step
  if (next < 0 || next > row.quantity) return // − mai sotto 0, + mai oltre la collezione
  delta.value[row.id] = next - row.baseLeft
}

const tabs = [
  { id: 'all', label: 'Tutte' },
  { id: 'kept', label: 'Usate nei mazzi' },
  { id: 'sell', label: 'Da vendere' },
]

const visibleRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter(
    (r) =>
      (view.value === 'all' ||
        (view.value === 'kept' ? r.used > 0 : r.baseLeft > 0 || r.left > 0)) &&
      (!rarityFilter.value.length || rarityFilter.value.includes(rarityInfo(r.rarity).id)) &&
      (!q || r.name.toLowerCase().includes(q)),
  )
})

function download() {
  const blob = new Blob([buildDek(rows.value)], { type: 'application/xml' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'binder.dek' })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
</script>

<template>
  <div class="shell">
    <div class="titlebar">
      <h1>Binder Cleaner</h1>
      <span>Togli dalla collezione le carte che usi nei mazzi e crea il binder da vendere ai bot</span>
    </div>

    <div class="layout">
      <aside class="side">
        <section class="panel">
          <header>1. Collezione</header>
          <div class="body">
            <DropZone title="Trascina qui il .dek della collezione" hint="oppure clicca per sceglierlo"
              @files="onCollection" />
            <div v-if="collection" class="file-row">
              <span class="nome" :title="collection.name">{{ collection.name }}</span>
              <span class="n">{{ count(collection.cards) }} carte</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <header>2. Mazzi</header>
          <div class="body">
            <DropZone title="Trascina qui i .dek dei mazzi" hint="uno per mazzo, anche più file insieme" multiple
              @files="onDecks" />
            <div v-for="d in decks" :key="d.name" class="file-row">
              <span class="nome" :title="d.name">{{ d.name }}</span>
              <span class="n">{{ count(d.cards) }} carte</span>
              <button :aria-label="`Rimuovi ${d.name}`" title="Rimuovi mazzo" @click="removeDeck(d.name)">×</button>
            </div>
          </div>
        </section>

        <section class="panel">
          <header>Opzioni</header>
          <div class="body">
            <label class="opzione">
              <input v-model="byName" type="checkbox" />
              <span>
                Considera uguali le stampe con lo stesso nome
                <small>Utile se un mazzo usa una stampa diversa da quella in collezione. Di default si confronta il
                  CatID.</small>
              </span>
            </label>
          </div>
        </section>
      </aside>

      <section class="panel main">
        <div v-if="!result" class="vuoto">
          <p>Carica il .dek della collezione per iniziare.<br />Poi aggiungi i mazzi: il binder si aggiorna a ogni file.
          </p>
        </div>

        <template v-else>
          <div v-if="error || result.missing.length" class="body" style="padding-bottom: 0">
            <p v-if="error" class="errore">{{ error }}</p>
            <details v-if="result.missing.length" class="avviso">
              <summary>{{ result.missing.length }} carte dei mazzi non sono in collezione</summary>
              <ul>
                <li v-for="m in result.missing" :key="m.name">{{ m.qty }}× {{ m.name }}</li>
              </ul>
            </details>
          </div>

          <div class="stats">
            <div class="stat"><b>{{ totals.owned }}</b><span>carte in collezione</span></div>
            <div class="stat"><b>{{ totals.kept }}</b><span>tenute in collezione</span></div>
            <div class="stat vendita"><b>{{ totals.sell }}</b><span>da vendere</span></div>
          </div>

          <div class="toolbar">
            <div class="tabs" role="tablist">
              <button v-for="t in tabs" :key="t.id" class="tab" :class="{ attivo: view === t.id }" role="tab"
                :aria-selected="view === t.id" @click="view = t.id">{{ t.label }}</button>
            </div>
            <input v-model="search" type="search" placeholder="Cerca una carta" />
            <button class="btn-download" :disabled="!totals.sell" @click="download">Scarica binder.dek</button>
          </div>
          <div class="filtri">
            <span>Rarità</span>
            <button v-for="r in RARITIES" :key="r.id" class="chip" :class="{ attivo: rarityFilter.includes(r.id) }"
              :aria-pressed="rarityFilter.includes(r.id)" :disabled="rarityStatus !== 'ok'" @click="toggleRarity(r.id)"><i
                class="dot" :style="{ background: r.color }"></i>{{ r.label }}</button>
            <span v-if="rarityStatus === 'loading'" class="stato">Carico le rarità da Scryfall… {{ rarityProgress
            }}</span>
            <span v-else-if="rarityStatus === 'error'" class="stato">
              Rarità non disponibili: {{ rarityError }}
              <button @click="loadRarities">Riprova</button>
            </span>
          </div>
          <div class="tabella">
            <table>
              <thead>
                <tr>
                  <th>Carta</th>
                  <th>Rarità</th>
                  <th class="num">In collezione</th>
                  <th class="num">Nei mazzi</th>
                  <th class="num">Da vendere</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in visibleRows" :key="i" :class="{ esaurita: !r.left }">
                  <td>{{ r.name }}</td>
                  <td>
                    <template v-if="r.rarity">
                      <i class="dot" :style="{ background: rarityInfo(r.rarity).color }"></i>{{ rarityInfo(r.rarity).label
                      }}
                    </template>
                  </td>
                  <td class="num">{{ r.quantity }}</td>
                  <td class="num">{{ r.used }}</td>
                  <td class="num vendi">
                    <div class="stepper">
                      <button :disabled="r.left <= 0" :aria-label="`Riduci ${r.name}`" @click="adjust(r, -1)">−</button>
                      <span :class="{ modificato: r.left !== r.baseLeft }">{{ r.left }}</span>
                      <button :disabled="r.left >= r.quantity" :aria-label="`Aumenta ${r.name}`"
                        @click="adjust(r, 1)">+</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="!visibleRows.length" class="vuoto">Nessuna carta corrisponde ai filtri.</p>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>
