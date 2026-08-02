const args = process.argv.slice(2)

if (args.includes('--help')) {
  console.log(
    'Usage: data:build --input <encode-input.json> [--out <dir>] [--state <path>] [--generated-at <rfc3339>] [--dry-run]'
  )
} else {
  const { main } = await import('../pipeline/encode.ts')
  process.exitCode = await main(args)
}
