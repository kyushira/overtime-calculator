// Test fixtures are loaded as text via Vite-style `?raw` imports (vitest honours these).
// Declared here so the Vite client types are not needed.
declare module '*?raw' {
  const content: string;
  export default content;
}
