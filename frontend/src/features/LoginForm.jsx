import React, { useState } from 'react';
import Input from '../components/Input';
import Button from '../components/Button';
import { enterRoom } from '../services/auth';

export default function LoginForm({ onLoginSuccess }) {
  const [nomeUrl, setNomeUrl] = useState('');
  const [senha, setSenha] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nomeUrl.trim() || !senha || !nickname.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    try {
      setSending(true); // ou setLoading(true) conforme seu código
      setLoading(true);
      setError('');
      const data = await enterRoom({
        nome_url: nomeUrl.trim().toLowerCase(),
        senha,
        nickname: nickname.trim(),
      });
      
      // 👇 SALVA O TOKEN AQUI ANTES DE PASSAR ADIANTE 👇
      if (data && data.access_token) {
        localStorage.setItem('token', data.access_token);
      }

      onLoginSuccess(data);
    } catch (err) {
      setError(err.message || 'Falha ao acessar sala.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-8 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-2xl backdrop-blur-md">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
          NullPort
        </h2>
        <p className="text-xs text-zinc-400 mt-1 uppercase tracking-widest">
          Acesso Zero-Login & Criptografia
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Identificador da Sala (URL)"
          placeholder="ex: sala-secreta-42"
          value={nomeUrl}
          onChange={(e) => setNomeUrl(e.target.value)}
          required
        />
        <Input
          label="Seu Nickname"
          placeholder="ex: GhostCoder"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
        />
        <Input
          label="Senha da Sala"
          type="password"
          placeholder="••••••••••••"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />
        <Button type="submit" className="w-full mt-2" disabled={loading}>
          {loading ? 'Conectando...' : 'Entrar na Sala'}
        </Button>
      </form>
    </div>
  );
}
