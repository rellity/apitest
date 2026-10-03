import { CheckCircleIcon, XIcon } from './icons'

export const Toast = ({ message, tone = 'success' }: { message: string; tone?: 'success' | 'error' }) => (
  <div
    hx-swap-oob="beforeend:#toast-region"
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
