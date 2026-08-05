'use client'
import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

const LazyGalaxyUniverse = dynamic(
  () => import('./GalaxyUniverse').then((module) => module.GalaxyUniverse),
  {
    ssr: false,
    loading: () => <div aria-hidden="true" className="ph" />,
  }
)

/**
 * @description Defers the client-only galaxy module until its pane nears the viewport.
 * @returns The visibility gate and, when eligible, the lazy galaxy cluster.
 */
export function GalaxyUniverseIsland() {
  const target = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = target.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        setVisible(true)
        observer.disconnect()
      },
      { rootMargin: '200px', threshold: 0 }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={target} style={{ height: '100%', width: '100%' }}>
      {visible ? <LazyGalaxyUniverse /> : <div aria-hidden="true" className="ph" />}
    </div>
  )
}
