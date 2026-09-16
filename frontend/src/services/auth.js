import { request } from './api';

export async function enterRoom({ nome_url, senha, nickname }) {
  const data = await request('/api/auth/room', {
    method: 'POST',
    body: JSON.stringify({ nome_url, senha, nickname }),
  });
  if (data.access_token) {
    localStorage.setItem('nullport_token', data.access_token);
    localStorage.setItem('nullport_user', JSON.stringify({
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
  localStorage.removeItem('nullport_token');
  localStorage.removeItem('nullport_user');
}
