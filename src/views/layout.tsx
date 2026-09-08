import type { FC, PropsWithChildren } from 'hono/jsx'

export const Layout: FC<PropsWithChildren> = ({ children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>shopilyo</title>
      <link rel="stylesheet" href="/styles.css" />
      <script src="/app.js" defer></script>
    </head>
    <body class="min-h-screen bg-zinc-50 font-sans text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      {children}
    </body>
  </html>
)
