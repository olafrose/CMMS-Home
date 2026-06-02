import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'
import BottomNav from '@/components/BottomNav'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })

export const metadata: Metadata = {
  title: 'CMMS@home',
  description: 'Home maintenance tracker',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'CMMS@home' },
}

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <body className="bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-h-screen pb-16 antialiased">
        <ThemeProvider>
          {children}
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  )
}
