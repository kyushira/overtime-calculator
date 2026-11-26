'use client';

import dynamic from 'next/dynamic';

// The accounts load from localStorage during render, so the page is client-only
// (same reason as HomeClient and ClientApp). ssr:false is only allowed in a Client Component.
const SavingsPage = dynamic(() => import('../../src/components/savings/SavingsPage').then((m) => m.SavingsPage), { ssr: false });

export default function SavingsClient() {
  return <SavingsPage />;
}
