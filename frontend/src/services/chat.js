const API_URL = import.meta.env.VITE_API_URL || '';

export async function fetchMessages() {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}/api/chat/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Erro ao buscar mensagens");
  return response.json();
}

export async function sendMessage(conteudo, replyToId = null) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}/api/chat/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ conteudo, reply_to_id: replyToId })
  });
  if (!response.ok) throw new Error("Erro ao enviar mensagem");
  return response.json();
}

export async function uploadImage(file) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/api/chat/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  if (!response.ok) throw new Error("Erro no upload da imagem");
  return response.json();
}

// 👈 Esta é a função nova de reações que entrou agora
export async function reactToMessage(messageId, emoji) {
  const token = localStorage.getItem('token');
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

export function subscribeToMessages(onMessageCallback) {
  const token = localStorage.getItem('token');
  const eventSource = new EventSource(`${API_URL}/api/chat/stream?token=${token}`);

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