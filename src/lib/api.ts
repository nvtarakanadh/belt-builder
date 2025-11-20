/**
 * Utility functions for API requests with CSRF token handling
 */

import { API_BASE } from './config';

/**
 * Get CSRF token from cookies
 */
function getCsrfToken(): string | null {
  const name = "csrftoken";
  const cookies = document.cookie.split(";");
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Fetch CSRF token from Django
 */
async function fetchCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/api/csrf/`, {
      credentials: "include",
    });
    if (response.ok) {
      const data = await response.json();
      return data.csrfToken || null;
    }
  } catch (error) {
    console.warn("Failed to fetch CSRF token:", error);
  }
  return null;
}

/**
 * Get or fetch CSRF token
 */
export async function getOrFetchCsrfToken(): Promise<string | null> {
  let token = getCsrfToken();
  if (!token) {
    token = await fetchCsrfToken();
  }
  return token;
}

/**
 * Make an API request with CSRF token
 */
export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
  
  // Get CSRF token
  const csrfToken = await getOrFetchCsrfToken();
  
  // Prepare headers
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  
  // Add CSRF token if available
  if (csrfToken) {
    headers["X-CSRFToken"] = csrfToken;
  }
  
  // Make request
  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
}

