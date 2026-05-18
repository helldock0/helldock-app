import type { Metadata } from 'next'
import { Fira_Sans, Fira_Code } from 'next/font/google'
import './globals.css'

const firaSans = Fira_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-fira-sans',
  display: 'swap',
})

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fira-code',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Helldock',
  description: 'Private Valorant scrim analytics',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body className="bg-surface text-fg antialiased min-h-screen font-sans">
        {children}
      </body>
    </html>
  )
}
