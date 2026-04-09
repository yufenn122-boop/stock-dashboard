import './globals.css'

export const metadata = {
  title: '股指监控看板',
  description: '实时监控全球主要股指',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  )
}
