import type { FC, PropsWithChildren } from 'hono/jsx'

export const Counter: FC<PropsWithChildren> = () => (
  <main class="mx-auto max-w-md space-y-4 p-6">
    <div x-data="{ count: 0 }" class="flex items-center gap-4 rounded-lg bg-white p-6 shadow-sm">
      <h1 class="text-2xl font-semibold">
        count: <span x-text="count" class="tabular-nums text-indigo-600"></span>
      </h1>
      <button x-on:click="count++" class="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">
        +
      </button>
    </div>
  </main>
)
