const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function request(endpoint, options = {}) {
  const token = localStorage.getItem('nullport_token');
  const headers = {
    ...options.headers,
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Erro desconhecido' }));
    throw new Error(errorData.detail || `Erro ${response.status}`);
  }

  return response.json();
}
