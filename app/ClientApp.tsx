'use client';

import dynamic from 'next/dynamic';
import type { Mode } from '../src/components/nav/navModel';

// The app reads localStorage and location.hash during render, so it is client-only.
const App = dynamic(() => import('../src/App'), { ssr: false });

/** One shell for all module routes; the route decides which module is shown. */
export default function ClientApp({ module }: { module: Mode }) {
  return <App module={module} />;
}
