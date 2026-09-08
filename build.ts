import { $ } from 'bun'

const result = await Bun.build({
  entrypoints: ['./src/client.ts'],
  outdir: './dist',
  naming: 'app.js',
  target: 'browser',
  minify: true,
  sourcemap: 'linked',
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

await $`tailwindcss -i src/styles.css -o dist/styles.css --minify`
console.log('built dist/app.js, dist/styles.css, and dist/fonts/')
