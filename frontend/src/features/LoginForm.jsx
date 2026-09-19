import React, { useState } from 'react';
import Input from '../components/Input';
import Button from '../components/Button';
import { loginUser, registerUser, enterRoom } from '../services/auth';

export default function LoginForm({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'room'
  const [loginId, setLoginId] = useState('');
  const [senha, setSenha] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [nomeUrl, setNomeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        if (!loginId.trim() || !senha) {
          throw new Error('Preencha seu login e senha.');
        }
        const data = await loginUser({ login: loginId.trim(), senha });
        onLoginSuccess(data.user);
      } else if (mode === 'register') {
        if (!nickname.trim() || !email.trim() || !senha) {
          throw new Error('Preencha todos os campos para cadastrar.');
        }
        const data = await registerUser({
          nickname: nickname.trim(),
          email: email.trim().toLowerCase(),
          senha,
        });
        onLoginSuccess(data.user);
      } else if (mode === 'room') {
        if (!nomeUrl.trim() || !nickname.trim()) {
          throw new Error('Informe o identificador da sala e seu nickname.');
        }
        const data = await enterRoom({
          nome_url: nomeUrl.trim().toLowerCase(),
          senha,
          nickname: nickname.trim(),
        });
        onLoginSuccess({
          id: data.user_id,
          user_id: data.user_id,
          sala_id: data.sala_id,
          nickname: data.nickname,
          nome_url: data.nome_url,
          is_legacy_room: true,
        });
      }
    } catch (err) {
      setError(err.message || 'Falha na autenticação.');
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
          Ecossistema SaaS Seguro & SSE Real-Time
        </p>
      </div>

      {/* Seletor de Modo / Tabs */}
      <div className="flex rounded-xl bg-zinc-950/60 p-1 mb-6 border border-zinc-800/80 text-xs">
        <button
          type="button"
          onClick={() => { setMode('login'); setError(''); }}
          className={`flex-1 py-2 rounded-lg font-medium transition-all ${
            mode === 'login'
              ? 'bg-zinc-800 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setError(''); }}
          className={`flex-1 py-2 rounded-lg font-medium transition-all ${
            mode === 'register'
              ? 'bg-zinc-800 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Cadastrar
        </button>
        <button
          type="button"
          onClick={() => { setMode('room'); setError(''); }}
          className={`flex-1 py-2 rounded-lg font-medium transition-all ${
            mode === 'room'
              ? 'bg-zinc-800 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Sala Direta
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <span className="font-bold">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleAuth} className="space-y-4">
        {mode === 'login' && (
          <>
            <Input
              label="E-mail ou Nickname"
              placeholder="ex: user@nullport.io ou GhostCoder"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
            />
            <Input
              label="Senha"
              type="password"
              placeholder="••••••••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? 'Autenticando...' : 'Acessar Conta'}
            </Button>
          </>
        )}

        {mode === 'register' && (
          <>
            <Input
              label="Nickname Único"
              placeholder="ex: MatrixOperator"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
            />
            <Input
              label="E-mail Corporativo / Pessoal"
              type="email"
              placeholder="seuemail@provedor.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Senha Forte (mínimo 6 caracteres)"
              type="password"
              placeholder="••••••••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? 'Cadastrando...' : 'Criar Conta SaaS'}
            </Button>
          </>
        )}

        {mode === 'room' && (
          <>
            <Input
              label="Identificador da Sala (URL)"
              placeholder="ex: sala-secreta-42"
              value={nomeUrl}
              onChange={(e) => setNomeUrl(e.target.value)}
              required
            />
            <Input
              label="Seu Nickname Provisório"
              placeholder="ex: Guest_99"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
            />
            <Input
              label="Senha da Sala (opcional se pública)"
              type="password"
              placeholder="••••••••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <Button type="submit" className="w-full mt-2" disabled={loading}>
              {loading ? 'Conectando...' : 'Entrar na Sala'}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
