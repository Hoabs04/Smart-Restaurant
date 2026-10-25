import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Smart Restaurant Management | Hệ thống Quản lý Nhà hàng Thông minh AWS',
  description: 'Hệ thống Quản lý Nhà hàng thông minh trên nền tảng điện toán đám mây Amazon Web Services (Modular Monolith, Tablet-first)',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="dark">
      <body className="antialiased selection:bg-amber-500 selection:text-slate-900">
        {children}
      </body>
    </html>
  );
}
