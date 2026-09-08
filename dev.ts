export {}

const procs = [
  ['bun', 'build', 'src/client.ts', '--outdir', 'public', '--entry-naming', 'app.js', '--target', 'browser', '--watch'],
  ['bunx', 'tailwindcss', '-i', 'src/styles.css', '-o', 'public/styles.css', '--watch'],
  ['bun', 'run', '--hot', 'src/index.ts'],
].map((cmd) => Bun.spawn(cmd, { stdio: ['inherit', 'inherit', 'inherit'] }))

const shutdown = () => procs.forEach((p) => p.kill())
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
await Promise.all(procs.map((p) => p.exited))
