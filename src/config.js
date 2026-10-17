export const config = {
  apiKey: import.meta.env.DEV ? (import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY') : '',
  feedEndpoint: import.meta.env.PROD ? '/api/neo/today' : null,
  timeZone: 'Asia/Shanghai',
  requestTimeoutMs: 15_000,
};
