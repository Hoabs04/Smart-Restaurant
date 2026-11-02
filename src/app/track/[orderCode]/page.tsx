import React from 'react';
import LiveOrderTracker from '@/components/guest/LiveOrderTracker';
import { Metadata } from 'next';

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ orderCode: string }> 
}): Promise<Metadata> {
  const { orderCode } = await params;
  const code = decodeURIComponent(orderCode || '');
  return {
    title: `Đơn hàng ${code} | Smart Restaurant Live Tracking`,
    description: `Trang theo dõi tiến độ chế biến và phục vụ món ăn cho đơn hàng ${code}.`,
  };
}

export default async function GuestOrderTrackPage({ 
  params 
}: { 
  params: Promise<{ orderCode: string }> 
}) {
  const { orderCode } = await params;
  const cleanOrderCode = decodeURIComponent(orderCode || '');

  return <LiveOrderTracker orderCode={cleanOrderCode} />;
}
