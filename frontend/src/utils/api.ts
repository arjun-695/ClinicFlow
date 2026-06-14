export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function fetchAPI(path: string, options: RequestInit = {}) {
  const url = `${API_URL}${path}`;

  // Default headers
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Inject Medplum Access Token if present in localStorage
  if (typeof window !== 'undefined') {
    const medplumToken = localStorage.getItem('medplum_access_token');
    if (medplumToken) {
      headers.set('Authorization', `Bearer ${medplumToken}`);
    }
  }

  const mergedOptions: RequestInit = {
    credentials: 'include', // Send cookies/session
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
