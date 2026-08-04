'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import aiurSnapshot from '@/packages/aiur-dag/fixtures/aiur.json'
import {
  buildFileDag,
  DEFAULT_THEME,
  layoutDag,
  nextCommitIndex,
  playbackFrame,
  renderDag,
  type PlaybackDirection,
  type RepoSnapshot,
} from '@/packages/aiur-dag/src'

const DIRECTION_LABELS: Record<PlaybackDirection, string> = {
  forward: 'forward',
  backward: 'backward',
}

/** Loads the embedded aiur snapshot as a typed value. */
const SNAPSHOT = aiurSnapshot as RepoSnapshot

const STEP_MS = 900

/**
 * @description Renders the interactive aiur-dag visualization for the aiur repo.
 * @returns The canvas plus forward/backward playback controls.
 */
export function AiurDag(): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const directionRef = useRef<PlaybackDirection>('forward')
  const indexRef = useRef(0)
  const [direction, setDirection] = useState<PlaybackDirection>('forward')
  const [date, setDate] = useState(SNAPSHOT.commits[0]?.date ?? '')

  const engine = useMemo(() => {
    const dag = buildFileDag(SNAPSHOT)
    const layout = layoutDag(dag)
    const pathToNode = new Map<string, string>()
    for (const node of dag.nodes.values()) {
      if (node.isFile) pathToNode.set(node.path, node.id)
    }
    return { dag, layout, pathToNode }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = (): void => {
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    let raf = 0
    let last = performance.now()
    const frame = (now: number): void => {
      if (now - last >= STEP_MS) {
        last = now
        indexRef.current = nextCommitIndex(
          playbackFrame(SNAPSHOT, indexRef.current, directionRef.current),
          directionRef.current
        )
      }
      const playback = playbackFrame(SNAPSHOT, indexRef.current, directionRef.current)
      const dateLabel = playback.commit?.date ?? ''
      setDate(dateLabel)
      renderDag(
        ctx,
        { width: canvas.width, height: canvas.height, dpr },
        {
          layout: engine.layout,
          frame: playback,
          pathToNode: engine.pathToNode,
        },
        DEFAULT_THEME
      )
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [engine])

  const toggle = (): void => {
    const next: PlaybackDirection =
      directionRef.current === 'forward' ? 'backward' : 'forward'
    directionRef.current = next
    setDirection(next)
  }

  const jump = (fraction: number): void => {
    const index = Math.max(
      0,
      Math.min(SNAPSHOT.commits.length - 1, Math.round(fraction * (SNAPSHOT.commits.length - 1)))
    )
    indexRef.current = index
  }

  return (
    <div>
      <canvas
        aria-label="Animated DAG of the aiur repository and its contribution history"
        ref={canvasRef}
        role="img"
        style={{ display: 'block', height: '24rem', width: '100%' }}
        tabIndex={0}
      >
        Animated DAG of aiur-team/aiur: every file is a node, and contributions
        link the kw contributor to the files it touched.
      </canvas>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
        <button onClick={toggle} type="button">
          play {DIRECTION_LABELS[direction]}
        </button>
        <button onClick={() => jump(0)} type="button">
          start
        </button>
        <button onClick={() => jump(1)} type="button">
          end
        </button>
        <input
          aria-label="scrub the contribution timeline"
          max="1"
          min="0"
          onChange={(event) => jump(Number(event.target.value))}
          step="any"
          style={{ flex: 1 }}
          type="range"
        />
        <span>{date}</span>
      </div>
    </div>
  )
}
