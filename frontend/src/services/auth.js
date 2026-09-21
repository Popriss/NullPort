import { request } from './api';

export function getToken() {
  return localStorage.getItem('token') || localStorage.getItem('nullport_token');
}

export async function registerUser({ nickname, email, senha, telefone }) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ nickname, email, senha, telefone }),
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

// RF01: Autenticação rápida via SMS OTP
export async function sendOtp(telefone) {
  return await request('/api/auth/otp/send', {
    method: 'POST',
    body: JSON.stringify({ telefone }),
  });
}

export async function verifyOtp({ telefone, codigo, nickname }) {
  const data = await request('/api/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ telefone, codigo, nickname }),
  });
  if (data.access_token) {
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('nullport_token', data.access_token);
    localStorage.setItem('nullport_user', JSON.stringify(data.user));
  }
  return data;
}

// RF01: Gestão de Sessões Multidispositivo
export async function listSessions() {
  const token = getToken();
  return await request('/api/auth/sessions', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function revokeSession(sessionId) {
  const token = getToken();
  return await request(`/api/auth/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function revokeOtherSessions() {
  const token = getToken();
  return await request('/api/auth/sessions/revoke/others', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
}

// RN06: Exclusão de Conta / LGPD (Direito ao Esquecimento)
export async function deleteAccount(senha) {
  const token = getToken();
  const res = await request('/api/auth/me', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ senha })
  });
  logout();
  return res;
}

// RN01: Chave Pública E2EE
export async function updatePublicKeyE2EE(publicKey) {
  const token = getToken();
  return await request('/api/auth/public-key', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ public_key_e2ee: publicKey })
  });
}

export async function getUserPublicKeyE2EE(userId) {
  const token = getToken();
  return await request(`/api/auth/users/${userId}/public-key`, {
    headers: { Authorization: `Bearer ${token}` }
  });
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
