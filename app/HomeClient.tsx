'use client';

import dynamic from 'next/dynamic';

// Theme and legacy-hash handling read browser state, so the home page is client-only
// (same reason as ClientApp). ssr:false is only allowed inside a Client Component.
const Home = dynamic(() => import('../src/home/Home').then((m) => m.Home), { ssr: false });

export default function HomeClient() {
  return <Home />;
}
