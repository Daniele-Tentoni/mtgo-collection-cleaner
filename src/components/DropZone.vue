<script setup>
import { ref } from 'vue'

defineProps({ title: String, hint: String, multiple: Boolean })
const emit = defineEmits(['files'])

const over = ref(false)
const input = ref(null)

function pick(list) {
  const files = [...list].filter((f) => /\.(dek|xml)$/i.test(f.name))
  if (files.length) emit('files', files)
}
function onDrop(e) {
  over.value = false
  pick(e.dataTransfer.files)
}
function onInput(e) {
  pick(e.target.files)
  e.target.value = ''
}
</script>

<template>
  <div
    class="drop"
    :class="{ over }"
    role="button"
    tabindex="0"
    @click="input.click()"
    @keydown.enter="input.click()"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="onDrop"
  >
    <strong>{{ title }}</strong>
    <span>{{ hint }}</span>
    <input ref="input" type="file" accept=".dek,.xml" :multiple="multiple" hidden @change="onInput" />
  </div>
</template>

<style scoped>
.drop {
  display: flex; flex-direction: column; gap: 2px; align-items: center; text-align: center;
  padding: 16px 10px; cursor: pointer;
  background: var(--abisso); border: 1px dashed var(--bordo); border-radius: 3px;
}
.drop span { color: var(--spento); }
.drop:hover, .drop.over { border-color: var(--oro); background: #1a1d22; }
</style>
