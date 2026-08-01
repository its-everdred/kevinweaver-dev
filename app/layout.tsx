import type { Metadata, Viewport } from 'next'
import { Scanline } from '@/components/ds/Scanline'
import { IDENTITY } from '@/content/identity'
import { jetbrainsMono } from './fonts'
import './globals.css'

const TWITTER =
  IDENTITY.links.find((link) => link.label.includes('twitter')) ?? null
const TWITTER_HANDLE = TWITTER
  ? `@${new URL(TWITTER.href).pathname.replace(/^\/+/, '')}`
  : undefined

export const metadata: Metadata = {
  metadataBase: new URL('https://www.kevinweaver.dev'),
  title: 'Kevin Weaver — Lead Fullstack Software Engineer',
  description:
    'Kevin Weaver, lead fullstack software engineer. Web3 builder, Ethereum enthusiast, public goods enjoyer. Sixteen years of commits, replayed backwards.',
  applicationName: IDENTITY.site,
  authors: [{ name: IDENTITY.name, url: `https://${IDENTITY.site}` }],
  creator: IDENTITY.name,
  publisher: IDENTITY.name,
  alternates: {
    canonical: '/',
    types: {
      'text/plain': [{ url: '/resume.txt', title: 'resume.txt' }],
      'text/troff': [{ url: '/kevinweaver.1', title: 'kevinweaver(1)' }],
    },
  },
  icons: { icon: '/favicon.ico' },
  openGraph: {
    type: 'profile',
    siteName: IDENTITY.site,
    url: '/',
    locale: 'en_US',
    firstName: 'Kevin',
    lastName: 'Weaver',
    username: IDENTITY.whoami,
    description:
      "Sixteen years of commits, replayed backwards. Web3 builder, Ethereum enthusiast, public goods enjoyer, building coordination tools on the internet's frontier.",
  },
  twitter: {
    card: 'summary_large_image',
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
    description:
      'Sixteen years of commits, replayed backwards. Two committers: one human, one agent.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
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
        <noscript>
          <p className="kw-noscript">
            The contribution instrument needs JavaScript. Everything else on
            this page is already here. The same resume is served as plain text
            at <a href="/resume.txt">/resume.txt</a> and as a manual page at{' '}
            <a href="/kevinweaver.1">/kevinweaver.1</a>.
          </p>
        </noscript>
        <Scanline />
        {children}
      </body>
    </html>
  )
}
