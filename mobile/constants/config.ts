export const APP_NAME = 'Kamba Online';

// The WhatsApp number and office phone are set by the admin (WhatsApp & phone page), not here.

/** Backend API. Start it with `npm start` inside /server (default port 3001). */
// When the app is served by the Kamba server itself (installed desktop app), the API is on the same address.
const servedByKambaServer =
  typeof window !== 'undefined' && !!window.location && window.location.port !== '8081' && window.location.protocol.startsWith('http');
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (servedByKambaServer ? window.location.origin : 'http://localhost:3001');
