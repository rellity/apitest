import { CheckCircleIcon, XIcon } from './icons'

export const Toast = ({ message, tone = 'success' }: { message: string; tone?: 'success' | 'error' }) => (
  <div
    // htmx strips the wrapper for non-outer oob swaps by default; strip:false
    // keeps this div (its role, classes and auto-remove timer).
    hx-swap-oob="beforeend target:#toast-region strip:false"
    x-data=""
    x-init="setTimeout(() => $el.remove(), 3000)"
    role={tone === 'error' ? 'alert' : 'status'}
    class="pointer-events-auto flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
  >
    {tone === 'error' ? (
      <XIcon class="size-4 text-red-400 dark:text-red-600" />
    ) : (
      <CheckCircleIcon class="size-4 text-emerald-400 dark:text-emerald-600" />
    )}
    {message}
  </div>
)
