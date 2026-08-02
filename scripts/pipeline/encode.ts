import { pathToFileURL } from 'node:url'
import type {
  EncodedBundle,
  EncodedFile,
  EncodeInput,
  RawEvent,
  RepoInput,
  SamlCanary,
} from './encode-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { main, promoteBundle, writeBundle } from './encode-runtime.ts'
export type {
  EncodedBundle,
  EncodedFile,
  EncodeInput,
  RawEvent,
  RepoInput,
  SamlCanary,
}
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
export { encodeBundle } from './encode-bundle.ts'
export { main, promoteBundle, writeBundle }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().then((code) => {
    process.exitCode = code
  })
