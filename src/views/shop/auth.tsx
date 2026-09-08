const inputClass =
  'mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 placeholder:text-zinc-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'

export const LoginPage = ({ error, redirect }: { error?: string; redirect: string }) => (
  <div class="mx-auto max-w-sm space-y-4">
    <h1 class="font-display text-xl font-semibold text-zinc-900 dark:text-zinc-100">Log In</h1>
    {error && (
      <p class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>
    )}
    <form
      method="post"
      action="/shop/login"
      class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <input type="hidden" name="redirect" value={redirect} />
      <label class="block text-sm">
        <span class="text-zinc-600 dark:text-zinc-400">Email</span>
        <input name="email" type="email" required autofocus class={inputClass} />
      </label>
      <label class="block text-sm">
        <span class="text-zinc-600 dark:text-zinc-400">Password</span>
        <input name="password" type="password" required class={inputClass} />
      </label>
      <button class="w-full rounded-full bg-brand-600 px-6 py-3 font-medium text-white transition hover:bg-brand-700 active:scale-[0.98]">
        Log In
      </button>
    </form>
    <p class="text-center text-sm text-zinc-500 dark:text-zinc-400">
      New here?{' '}
      <a
        href={`/shop/register?redirect=${encodeURIComponent(redirect)}`}
        class="text-brand-600 hover:underline dark:text-brand-400"
      >
        Create an account
      </a>
    </p>
  </div>
)

export const RegisterPage = ({ error, redirect }: { error?: string; redirect: string }) => (
  <div class="mx-auto max-w-sm space-y-4">
    <h1 class="font-display text-xl font-semibold text-zinc-900 dark:text-zinc-100">Create Account</h1>
    {error && (
      <p class="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{error}</p>
    )}
    <form
      method="post"
      action="/shop/register"
      class="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <input type="hidden" name="redirect" value={redirect} />
      <label class="block text-sm">
        <span class="text-zinc-600 dark:text-zinc-400">Full name</span>
        <input name="name" required autofocus class={inputClass} />
      </label>
      <label class="block text-sm">
        <span class="text-zinc-600 dark:text-zinc-400">Email</span>
        <input name="email" type="email" required class={inputClass} />
      </label>
      <label class="block text-sm">
        <span class="text-zinc-600 dark:text-zinc-400">Password</span>
        <input name="password" type="password" required minlength={8} class={inputClass} />
        <span class="mt-1 block text-xs text-zinc-400">At least 8 characters.</span>
      </label>
      <button class="w-full rounded-full bg-brand-600 px-6 py-3 font-medium text-white transition hover:bg-brand-700 active:scale-[0.98]">
        Create Account
      </button>
    </form>
    <p class="text-center text-sm text-zinc-500 dark:text-zinc-400">
      Already have an account?{' '}
      <a
        href={`/shop/login?redirect=${encodeURIComponent(redirect)}`}
        class="text-brand-600 hover:underline dark:text-brand-400"
      >
        Log in
      </a>
    </p>
  </div>
)
