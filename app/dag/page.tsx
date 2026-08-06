import type { Metadata } from 'next'
import { AiurGalaxy } from '@/components/aiur/AiurGalaxy'

export const metadata: Metadata = {
  title: 'aiur-galaxy — Kevin Weaver',
  description:
    'Animated DAG of the aiur repository: every file as a node, contributions linked, playable forward and backward.',
}

export default function DagPage() {
  return (
    <main className="kw-pad">
      <h1 style={{ fontSize: 'var(--fs-mono)', marginBottom: '1rem' }}>
        aiur-galaxy · aiur-team/aiur
      </h1>
      <AiurGalaxy />
    </main>
  )
}
