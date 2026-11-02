import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Restaurant Management | Hệ thống Quản lý Nhà hàng Thông minh AWS',
  description: 'Hệ thống Quản lý Nhà hàng thông minh trên nền tảng điện toán đám mây Amazon Web Services (Modular Monolith, Tablet-first)',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body 
        className="antialiased selection:bg-orange-500 selection:text-white"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
