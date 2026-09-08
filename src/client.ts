import 'htmx.org'
import 'htmx.org/dist/ext/hx-alpine-compat.js'
import Alpine from 'alpinejs'

declare global {
  interface Window {
    Alpine: typeof Alpine
  }
}

window.Alpine = Alpine
Alpine.start()
