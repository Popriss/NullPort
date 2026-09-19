const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';


function getToken() {
  return localStorage.getItem('token') || localStorage.getItem('nullport_token');
}

// --- Gestão de Salas e Árvore ---

export async function fetchRooms() {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Erro ao buscar salas");
  return response.json();
}

export async function fetchMyRooms() {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/chat/my-rooms`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Erro ao buscar salas.');
  return res.json();
}

export async function createRoom(roomData) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(roomData)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao criar sala");
  }
  return response.json();
}

export async function fetchSubrooms(roomId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/subrooms`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Erro ao buscar sub-canais");
  return response.json();
}

export async function createSubroom(roomId, data) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/subrooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao criar sub-canal");
  }
  return response.json();
}

export async function joinRoom(roomId, senha = null) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ senha: senha || null })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao ingressar na sala");
  }
  return response.json();
}

// --- Moderação ---

export async function muteMember(roomId, userId, isMuted) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/members/${userId}/mute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ is_muted: isMuted })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao alterar mute do membro");
  }
  return response.json();
}

export async function banMember(roomId, userId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/members/${userId}/ban`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao remover membro");
  }
  return response.json();
}

// --- Mensagens por Sala ---

export async function fetchRoomMessages(roomId) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao carregar mensagens da sala");
  }
  return response.json();
}

export async function sendRoomMessage(roomId, conteudo, replyToId = null) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/rooms/${roomId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ conteudo, reply_to_id: replyToId })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao enviar mensagem");
  }
  return response.json();
}

// --- Compatibilidade Legada ---

export async function fetchMessages() {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Erro ao buscar mensagens");
  return response.json();
}

export async function sendMessage(conteudo, replyToId = null) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ conteudo, reply_to_id: replyToId })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro ao enviar mensagem");
  }
  return response.json();
}

export async function uploadImage(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/api/chat/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Erro no upload da imagem");
  }
  return response.json();
}

export async function reactToMessage(messageId, emoji) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/messages/${messageId}/react`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ emoji })
  });
  if (!response.ok) throw new Error("Erro ao reagir à mensagem");
  return response.json();
}

export function subscribeToMessages(onMessageCallback, roomId = null) {
  const token = getToken();
  const url = roomId 
    ? `${API_URL}/api/chat/stream?token=${token}&room_id=${roomId}`
    : `${API_URL}/api/chat/stream?token=${token}`;

  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    if (event.data === ": keep-alive") return;
    try {
      const data = JSON.parse(event.data);
      onMessageCallback(data);
    } catch (err) {
      console.error("Erro ao parsear evento do SSE:", err);
    }
  };

  eventSource.onerror = (err) => {
    console.error("Erro na conexão SSE:", err);
  };

  return () => {
    eventSource.close();
  };
}

export async function reportMessage(messageId, roomId, motivo) {
  const token = getToken();
  const response = await fetch(`${API_URL}/api/chat/reports`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ mensagem_id: messageId, sala_id: roomId, motivo })
  });
  if (!response.ok) throw new Error("Erro ao registrar denúncia");
  return response.json();
}