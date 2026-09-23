// cPanel/Passenger entrypoint. The production build is committed so the server
// only needs runtime dependencies; it does not need TypeScript or Vite.
import './apps/api/dist/index.js';
