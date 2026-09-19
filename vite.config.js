import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base './' => gli asset funzionano su https://utente.github.io/<repo>/ senza configurare il nome del repo
export default defineConfig({
  base: '/mtgo-collection-cleaner/',
  plugins: [vue()],
})
