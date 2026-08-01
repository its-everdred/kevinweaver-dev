import type { Metadata, Viewport } from 'next'
import { Scanline } from '@/components/ds/Scanline'
import { jetbrainsMono } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.kevinweaver.dev'),
  title: 'Kevin Weaver — Lead Fullstack Software Engineer',
  description:
    'Lead fullstack engineer building human coordination tools on the internet’s frontier. A résumé and a live dashboard of what I am working on right now.',
}

export const viewport: Viewport = {
  themeColor: '#282828',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body className="kw-root">
        <Scanline />
        {children}
      </body>
    </html>
  )
}
