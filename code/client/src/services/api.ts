/**
 * API and Backend URL Configuration
 *
 * In production (e.g. Vercel/Netlify frontend + Render backend):
 * Set VITE_API_URL=https://your-resq-api.onrender.com
 *
 * In local development:
 * Defaults to empty string (relying on Vite proxy to http://localhost:5000)
 */

export const API_BASE_URL: string = (
  (import.meta as any).env?.VITE_API_URL || ''
).replace(/\/$/, '');

/**
 * Normalizes a relative API or asset path to point to the backend URL if configured.
 * Strictly idempotent: never duplicates prefix and leaves external URLs untouched.
 */
export function apiUrl(path: string): string {
  if (!path) return '';
  // Leave external/absolute URLs untouched
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('//') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path;
  }
  // If already prefixed with API_BASE_URL, return as-is
  if (API_BASE_URL && path.startsWith(API_BASE_URL)) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${cleanPath}` : cleanPath;
}

/**
 * Initializes global fetch interception so all relative /api and /uploads calls
 * automatically route to VITE_API_URL when deployed to an external static host.
 *
 * Safety guarantees:
 * - Leaves absolute URLs untouched (e.g. OpenStreetMap tiles, Nominatim, external CDNs).
 * - Leaves protocol-relative URLs (//...) untouched.
 * - Idempotent: Never prefixes URLs already starting with API_BASE_URL.
 * - Supports string, URL, and Request objects.
 */
export function initApiInterceptor(): void {
  if (typeof window === 'undefined' || !API_BASE_URL) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (typeof input === 'string') {
      // Ignore absolute external URLs or already-prefixed URLs
      if (
        input.startsWith('http://') ||
        input.startsWith('https://') ||
        input.startsWith('//') ||
        input.startsWith(API_BASE_URL)
      ) {
        return originalFetch(input, init);
      }
      if (input.startsWith('/api') || input.startsWith('/uploads')) {
        return originalFetch(`${API_BASE_URL}${input}`, init);
      }
    } else if (input instanceof URL) {
      // Check if it belongs to local static origin and needs backend rerouting
      if (
        input.origin === window.location.origin &&
        (input.pathname.startsWith('/api') || input.pathname.startsWith('/uploads'))
      ) {
        const fullUrl = `${API_BASE_URL}${input.pathname}${input.search}`;
        return originalFetch(fullUrl, init);
      }
    } else if (typeof Request !== 'undefined' && input instanceof Request) {
      try {
        const parsed = new URL(input.url, window.location.href);
        if (
          parsed.origin === window.location.origin &&
          (parsed.pathname.startsWith('/api') || parsed.pathname.startsWith('/uploads'))
        ) {
          const targetUrl = `${API_BASE_URL}${parsed.pathname}${parsed.search}`;
          const modifiedRequest = new Request(targetUrl, input);
          return originalFetch(modifiedRequest, init);
        }
      } catch {
        // Fallback to original if URL parse fails
      }
    }
    return originalFetch(input, init);
  };
}
