import React, { useState } from 'react';
import Input from '../components/Input';
import Button from '../components/Button';
import GalaxyCanvas from '../components/GalaxyCanvas';
import { loginUser, registerUser, enterRoom } from '../services/auth';

/**
 * LoginForm (Split-Screen 50/50)
 * 
 * Coluna Esquerda: Hero com animação Galaxy 3D em Canvas interativo (2.200 partículas).
 * Coluna Direita: Fundo sólido #050a08 com formulário isolado de login, registro e sala direta.
 */
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
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[#050a08] text-white">
      {/* Coluna Esquerda: Animação Galaxy 3D (Hero Container) */}
      <section className="flex-1 min-h-[320px] md:min-h-screen border-b md:border-b-0 md:border-r border-emerald-500/10 relative overflow-hidden">
        <GalaxyCanvas particleCount={2200} interactive={true} opacity={1.0} />
        
        {/* Overlay inferior de branding e gradiente */}
        <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12 pointer-events-none bg-gradient-to-t from-[#050a08] via-[#050a08]/30 to-transparent">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Galaxy Engine 3D • SSE Real-Time
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-emerald-400 drop-shadow-[0_0_30px_rgba(16,185,129,0.35)]">
              NullPort
            </h1>
            <p className="text-xs md:text-sm text-zinc-400 uppercase tracking-widest font-mono">
              SaaS Chat Seguro & Zero-Login
            </p>
          </div>
        </div>
      </section>

      {/* Coluna Direita: Formulário de Login / Cadastro */}
      <section className="flex-1 flex items-center justify-center p-6 md:p-12 bg-[#050a08]">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-2xl md:text-3xl font-bold text-emerald-400">
              Acesso ao Sistema
            </h2>
            <p className="text-xs text-zinc-400">
              Conecte-se com sua conta ou acesse uma sala diretamente
            </p>
          </div>

          {/* Seletor de Modo / Tabs */}
          <div className="flex rounded-xl bg-black/60 p-1.5 border border-emerald-500/20 text-xs font-semibold backdrop-blur-sm">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2 rounded-lg font-medium transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-emerald-500 text-[#050a08] font-bold shadow-md shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-emerald-300'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2 rounded-lg font-medium transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-emerald-500 text-[#050a08] font-bold shadow-md shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-emerald-300'
              }`}
            >
              Cadastrar
            </button>
            <button
              type="button"
              onClick={() => { setMode('room'); setError(''); }}
              className={`flex-1 py-2 rounded-lg font-medium transition-all cursor-pointer ${
                mode === 'room'
                  ? 'bg-emerald-500 text-[#050a08] font-bold shadow-md shadow-emerald-500/20'
                  : 'text-zinc-400 hover:text-emerald-300'
              }`}
            >
              Sala Direta
            </button>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
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
      </section>
    </div>
  );
}
