import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DATA_WORKFLOW = readFileSync(
  join(process.cwd(), '.github/workflows/data-bundle.yml'),
  'utf8'
)
const CI_WORKFLOW = readFileSync(
  join(process.cwd(), '.github/workflows/ci.yml'),
  'utf8'
)

describe('daily data bundle workflow', () => {
  it('can dispatch CI with the repository token', () => {
    expect(DATA_WORKFLOW).toMatch(
      /jobs:\n  regenerate:\n    permissions:[\s\S]*?actions: write[\s\S]*?contents: write/
    )
    expect(CI_WORKFLOW).toMatch(/on:\n[\s\S]*?workflow_dispatch:/)
  })

  it('dispatches CI on the generated branch before enabling auto-merge', () => {
    const dispatch = DATA_WORKFLOW.indexOf('gh workflow run ci.yml --ref "$branch"')
    const autoMerge = DATA_WORKFLOW.indexOf('gh pr merge "$pr_number" --squash --auto')
    expect(dispatch).toBeGreaterThan(-1)
    expect(autoMerge).toBeGreaterThan(dispatch)
  })
})
