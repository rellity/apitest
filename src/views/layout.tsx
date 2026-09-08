import type { FC, PropsWithChildren } from 'hono/jsx'

export const Layout: FC<PropsWithChildren> = ({ children }) => (
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Todos</title>
      <link rel="stylesheet" href="/styles.css" />
      <script src="/app.js" defer></script>
    </head>
    <body class="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
  </html>
)
