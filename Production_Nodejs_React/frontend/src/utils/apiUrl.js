/**
 * Build API URLs. When `VITE_API_BASE_URL` is set (e.g. `http://localhost:3000`),
 * requests go directly to the backend — avoids Vite dev-proxy edge cases (SSE/EventSource 404).
 * When unset, paths stay relative (`/api/...`) and the Vite proxy forwards to :3000.
 */
export function apiUrl(path) {
    const p = path.startsWith('/') ? path : `/${path}`;
    const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    return base ? `${base}${p}` : p;
}
