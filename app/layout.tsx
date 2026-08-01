import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'

// The design system is single-typeface. Loading the variable roman range plus the
// 400 italic here means no CLS and no self-hosted binaries to keep in sync.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

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
      <body>{children}</body>
    </html>
  )
}
