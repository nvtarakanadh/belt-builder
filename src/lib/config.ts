/**
 * API Configuration
 * Automatically detects the API base URL based on environment
 * 
 * Priority:
 * 1. VITE_API_BASE environment variable (set in deployment)
 * 2. Auto-detect based on current hostname
 * 3. Fallback to localhost:8000
 */

// Get API base URL from environment variable or auto-detect
function getApiBaseUrl(): string {
  // Priority 1: Check if VITE_API_BASE is explicitly set (best for deployment)
  const envApiBase = (import.meta as any).env?.VITE_API_BASE;
  if (envApiBase && envApiBase.trim() !== '') {
    return envApiBase.trim();
  }

  // Priority 2: Auto-detect based on current hostname
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    const port = window.location.port;

    // If running on localhost, use localhost:8000
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000';
    }

    // For production deployments:
    // - If backend is on same domain but different port, try that
    // - If backend is proxied through same origin, use same origin
    // - Otherwise, try common patterns
    
    // Try same origin first (works if backend is proxied or on same domain)
    // This is common for deployment platforms that proxy requests
    const sameOrigin = window.location.origin;
    
    // For Railway, Vercel, etc., backend URL should be set via VITE_API_BASE
    // But if not set, try same origin (assuming proxy setup)
    return sameOrigin;
  }

  // Priority 3: Fallback for SSR or unknown environment
  return 'http://localhost:8000';
}

export const API_BASE = getApiBaseUrl();

// Log API base for debugging
if (typeof window !== 'undefined') {
  console.log('🔗 API Base URL:', API_BASE);
  if (!(import.meta as any).env?.VITE_API_BASE) {
    console.warn('⚠️ VITE_API_BASE not set. Using auto-detected URL:', API_BASE);
    console.warn('💡 For production, set VITE_API_BASE environment variable to your backend URL');
  }
}

