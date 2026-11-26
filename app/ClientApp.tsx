'use client';

import dynamic from 'next/dynamic';

// The app reads localStorage and location.hash during render, so it is client-only.
const App = dynamic(() => import('../src/App'), { ssr: false });

export default function ClientApp() {
  return <App />;
}
