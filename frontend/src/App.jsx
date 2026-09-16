import React, { useState, useEffect } from 'react';
import LoginForm from './features/LoginForm';
import ChatBox from './features/ChatBox';
import { getCurrentUser, logout } from './services/auth';

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const savedUser = getCurrentUser();
    if (savedUser) {
      setUser(savedUser);
    }
  }, []);

  const handleLoginSuccess = (data) => {
    setUser({
      sala_id: data.sala_id,
      nickname: data.nickname,
      nome_url: data.nome_url,
    });
  };

  const handleLogout = () => {
    logout();
    setUser(null);
  };

  return (
    <main className="min-h-screen flex flex-col justify-center items-center p-4 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
      {user ? (
        <ChatBox user={user} onLogout={handleLogout} />
      ) : (
        <LoginForm onLoginSuccess={handleLoginSuccess} />
      )}
    </main>
  );
}
