const args = process.argv.slice(2)
const { main } = await import('../pipeline/encode.ts')

process.exitCode = await main(args)
