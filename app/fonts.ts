import localFont from 'next/font/local'

export const jetbrainsMono = localFont({
  variable: '--font-jetbrains-mono',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
  src: [
    {
      path: '../public/fonts/jetbrains-mono-latin-wght-normal.woff2',
      weight: '300 800',
      style: 'normal',
    },
    {
      path: '../public/fonts/jetbrains-mono-latin-wght-italic.woff2',
      weight: '300 800',
      style: 'italic',
    },
  ],
})
