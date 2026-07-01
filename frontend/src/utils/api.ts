export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchAPI(path: string, options: RequestInit = {}) {
  const url = `${API_URL}${path}`;

  // Default headers
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (typeof window !== 'undefined') {
    // Send auth token from localStorage for cross-domain auth
    const authToken = localStorage.getItem('auth_token');
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }

    const activeFacilityId = localStorage.getItem('active_facility_id');
    if (activeFacilityId) {
      headers.set('X-Facility-ID', activeFacilityId);
    }
  }

  const mergedOptions: RequestInit = {
    credentials: 'include', // Send cookies/session (fallback for same-domain)
    ...options,
    headers,
  };

  const response = await fetch(url, mergedOptions);

  if (!response.ok) {
    let errMsg = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data && data.error) {
        errMsg = data.error;
      }
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return response.json();
}
