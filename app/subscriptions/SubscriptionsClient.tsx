'use client';

import dynamic from 'next/dynamic';

// Reads localStorage and the theme during render, so the screen is client-only
// (same reason as HomeClient and ClientApp). ssr:false is only allowed in a Client Component.
const SubscriptionsPage = dynamic(
  () => import('../../src/components/subscriptions/SubscriptionsPage').then((m) => m.SubscriptionsPage),
  { ssr: false },
);

export default function SubscriptionsClient() {
  return <SubscriptionsPage />;
}
