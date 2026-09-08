import { $ } from 'bun'

await $`mkdir -p public/fonts`
await $`cp assets/fonts/*.woff2 public/fonts/`
await $`cp assets/favicon.svg public/favicon.svg`
await $`rm -f public/app.js.map`

const clientResult = await Bun.build({
  entrypoints: ['./src/client.ts'],
  outdir: './public',
  naming: 'app.js',
  target: 'browser',
  minify: true,
  sourcemap: 'none'
})
if (!clientResult.success) {
  for (const log of clientResult.logs) console.error(log)
  process.exit(1)
}

await $`tailwindcss -i src/styles.css -o public/styles.css --minify`

const serverResult = await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  naming: 'index.js',
  target: 'bun',
  minify: true,
})
if (!serverResult.success) {
  for (const log of serverResult.logs) console.error(log)
  process.exit(1)
}

console.log('built public/app.js, public/styles.css, public/fonts/, public/favicon.svg, and dist/index.js')
