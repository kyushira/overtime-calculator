import type { Metadata, Viewport } from 'next';
import '../src/index.css';

export const metadata: Metadata = {
  title: 'Salary & OT Calculator',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icon-180.png',
  },
  appleWebApp: { capable: true, title: 'OT Calc' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: '#ffffff',
};

// Theme before first paint: reads the saved preference ('auto' | 'light' | 'dark')
// and sets .dark on <html>. Same rules as src/utils/theme.ts; keep them in sync.
// Runs inline in <head>, so it may run before Next emits meta[name="theme-color"];
// the `if (meta)` guard makes that safe.
const THEME_SCRIPT = `
(function () {
  var root = document.documentElement;
  var pref = 'auto';
  try {
    var saved = localStorage.getItem('otcalc.theme.v1');
    if (saved === 'light' || saved === 'dark' || saved === 'auto') pref = saved;
  } catch (e) {
    /* storage blocked: stay on auto */
  }
  var systemDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var dark = pref === 'dark' || (pref === 'auto' && systemDark);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0d14' : '#ffffff');
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-page">{children}</body>
    </html>
  );
}
