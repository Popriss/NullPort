import { request } from './api';

export function getToken() {
  return localStorage.getItem('token') || localStorage.getItem('nullport_token');
}

export async function registerUser({ nickname, email, senha }) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ nickname, email, senha }),
  });
  if (data.access_token) {
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('nullport_token', data.access_token);
    localStorage.setItem('nullport_user', JSON.stringify(data.user));
  }
  return data;
}

export async function loginUser({ login, senha }) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, senha }),
  });
  if (data.access_token) {
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('nullport_token', data.access_token);
    localStorage.setItem('nullport_user', JSON.stringify(data.user));
  }
  return data;
}

export async function getMe() {
  const token = getToken();
  if (!token) return null;
  try {
    const user = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    localStorage.setItem('nullport_user', JSON.stringify(user));
    return user;
  } catch {
    logout();
    return null;
  }
}

export async function enterRoom({ nome_url, senha, nickname }) {
  const data = await request('/api/auth/room', {
    method: 'POST',
    body: JSON.stringify({ nome_url, senha, nickname }),
  });
  if (data.access_token) {
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('nullport_token', data.access_token);
    localStorage.setItem('nullport_user', JSON.stringify({
      id: data.user_id,
      user_id: data.user_id,
      sala_id: data.sala_id,
      nickname: data.nickname,
      nome_url: data.nome_url,
    }));
  }
  return data;
}

export function getCurrentUser() {
  const stored = localStorage.getItem('nullport_user');
  return stored ? JSON.parse(stored) : null;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('nullport_token');
  localStorage.removeItem('nullport_user');
}
