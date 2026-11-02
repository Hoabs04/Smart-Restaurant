import React from 'react';
import LiveOrderTracker from '@/components/guest/LiveOrderTracker';
import { Metadata } from 'next';

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ code: string }> 
}): Promise<Metadata> {
  const { code } = await params;
  const tableCode = decodeURIComponent(code || '');
  return {
    title: `Theo dõi tiến độ món - ${tableCode} | Smart Restaurant`,
    description: `Trang theo dõi quá trình chế biến và phục vụ món ăn trực tiếp cho ${tableCode}.`,
  };
}

export default async function GuestTableTrackPage({ 
  params 
}: { 
  params: Promise<{ code: string }> 
}) {
  const { code } = await params;
  const tableCode = decodeURIComponent(code || '');

  return <LiveOrderTracker tableCode={tableCode} />;
}
