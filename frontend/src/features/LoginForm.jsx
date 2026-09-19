import React, { useState } from 'react';
import Input from '../components/Input';
import Button from '../components/Button';
import GalaxyCanvas from '../components/GalaxyCanvas';
import { loginUser, registerUser, enterRoom } from '../services/auth';

/**
 * LoginForm — Design Minimalista, Tech & Funcional
 * 
 * Layout Split-Screen 50/50:
 * - Coluna Esquerda: HUD galáctico com métricas tech, tags do sistema e Canvas Galaxy 3D interativo.
 * - Coluna Direita: Console de autenticação minimalista com inputs com ícones, password toggles e switcher rápido.
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
          throw new Error('Informe seu identificador e senha.');
        }
        const data = await loginUser({ login: loginId.trim(), senha });
        onLoginSuccess(data.user);
      } else if (mode === 'register') {
        if (!nickname.trim() || !email.trim() || !senha) {
          throw new Error('Preencha todos os campos para criar a conta.');
        }
        if (senha.length < 6) {
          throw new Error('A senha deve conter no mínimo 6 caracteres.');
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
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[#050a08] text-white selection:bg-emerald-500 selection:text-black">
      {/* Coluna Esquerda: Hero Galaxy 3D com HUD Tech */}
      <section className="flex-1 min-h-[380px] md:min-h-screen border-b md:border-b-0 md:border-r border-emerald-500/10 relative overflow-hidden bg-[#050a08]">
        {/* Canvas de Partículas 3D Interativo */}
        <GalaxyCanvas particleCount={2200} interactive={true} opacity={1.0} />

        {/* Top HUD Flutuante */}
        <div className="absolute top-0 inset-x-0 p-6 md:p-8 flex items-center justify-between pointer-events-none z-10">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-mono text-sm tracking-wider font-bold">⬡ NULLPORT</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              v2.4 // PROTOCOL
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-400 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-emerald-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>CORE ONLINE • 2.2K PARTICLES</span>
          </div>
        </div>

        {/* Dica Interativa de Cursor (sutil no centro) */}
        <div className="hidden lg:flex absolute top-1/2 left-8 transform -translate-y-1/2 pointer-events-none opacity-40 hover:opacity-100 transition-opacity">
          <div className="border-l border-emerald-500/30 pl-3 py-1 text-[10px] font-mono text-zinc-400 space-y-0.5">
            <p className="text-emerald-400 font-semibold">// 3D GRAVITY FIELD</p>
            <p>Mova o mouse para interagir com a galáxia</p>
          </div>
        </div>

        {/* Bottom Overlay: Tipografia & Badges Minimalistas */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 md:p-12 pointer-events-none bg-gradient-to-t from-[#050a08] via-[#050a08]/40 to-transparent z-10">
          <div className="space-y-4 max-w-lg">
            <div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white flex items-center gap-1">
                <span className="text-emerald-400 drop-shadow-[0_0_25px_rgba(16,185,129,0.4)]">Null</span>
                <span>Port</span>
              </h1>
              <p className="text-xs md:text-sm font-mono text-zinc-400 uppercase tracking-widest mt-1">
                Arquitetura de Comunicação Defensiva & Zero-Login
              </p>
            </div>

            {/* Chips de Recursos Técnicos */}
            <div className="flex flex-wrap gap-2 pt-1 font-mono text-[10px]">
              <span className="px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/20 text-emerald-300">
                [ 🔐 E2EE READY ]
              </span>
              <span className="px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/20 text-emerald-300">
                [ ⚡ SSE STREAMING ]
              </span>
              <span className="px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/20 text-emerald-300">
                [ 🚪 ZERO-LOGIN GUEST ]
              </span>
              <span className="px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/20 text-emerald-300">
                [ ⏱️ SALAS EFÊMERAS ]
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Coluna Direita: Console Minimalista & Funcional */}
      <section className="flex-1 flex items-center justify-center p-6 md:p-12 bg-[#050a08] relative">
        <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-black/40 border border-emerald-500/20 backdrop-blur-xl shadow-[0_0_50px_-15px_rgba(16,185,129,0.12)] space-y-6">
          
          {/* Header do Card com Linha de Comando */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pb-2 border-b border-zinc-800/80">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="text-emerald-500 font-bold">$</span> auth --session
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500/60 inline-block"></span>
                <span>SECURE</span>
              </span>
            </div>

            <div className="pt-1">
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight flex items-center justify-between">
                <span>
                  {mode === 'login' && 'Entrar na Plataforma'}
                  {mode === 'register' && 'Cadastrar Operador'}
                  {mode === 'room' && 'Acesso Zero-Login'}
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {mode === 'login' && 'Autentique com suas credenciais para gerenciar canais.'}
                {mode === 'register' && 'Crie uma conta para criar salas e moderar canais.'}
                {mode === 'room' && 'Acesse uma sala temporária diretamente sem criar conta.'}
              </p>
            </div>
          </div>

          {/* Seletor Segmentado Minimalista */}
          <div className="flex rounded-xl bg-black/60 p-1 border border-zinc-800/80 text-xs font-mono">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'login'
                  ? 'bg-emerald-500 text-[#050a08] font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'text-zinc-400 hover:text-emerald-300'
              }`}
            >
              <span>🔐</span>
              <span>Entrar</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'register'
                  ? 'bg-emerald-500 text-[#050a08] font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'text-zinc-400 hover:text-emerald-300'
              }`}
            >
              <span>⚡</span>
              <span>Cadastrar</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('room'); setError(''); }}
              className={`flex-1 py-2 rounded-lg font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'room'
                  ? 'bg-emerald-500 text-[#050a08] font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'text-zinc-400 hover:text-emerald-300'
              }`}
            >
              <span>🚪</span>
              <span>Sala Direta</span>
            </button>
          </div>

          {/* Alerta de Erro Monospace */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-start gap-2">
              <span className="text-rose-400 font-bold">[ERRO]</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Formulários por Modo */}
          <form onSubmit={handleAuth} className="space-y-4">
            {mode === 'login' && (
              <>
                <Input
                  label="E-mail ou Nickname"
                  icon="👤"
                  placeholder="ex: operador@nullport.io ou GhostCoder"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  required
                  autoFocus
                />
                <Input
                  label="Senha Master"
                  icon="🔑"
                  type="password"
                  placeholder="••••••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  className="w-full mt-3 py-3"
                  loading={loading}
                  disabled={loading}
                >
                  Autenticar no Gateway →
                </Button>

                {/* Switchers Rápidos de Modo */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-zinc-500 gap-2 border-t border-zinc-900">
                  <button
                    type="button"
                    onClick={() => { setMode('register'); setError(''); }}
                    className="hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    Não tem conta? <span className="underline decoration-emerald-500/40">Criar agora</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode('room'); setError(''); }}
                    className="hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    Entrar em sala sem login →
                  </button>
                </div>
              </>
            )}

            {mode === 'register' && (
              <>
                <Input
                  label="Nickname Único"
                  icon="👾"
                  placeholder="ex: MatrixOperator"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                  autoFocus
                />
                <Input
                  label="E-mail de Contato"
                  icon="@"
                  type="email"
                  placeholder="seu@dominio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label="Senha Forte (mínimo 6 caracteres)"
                  icon="🔑"
                  type="password"
                  placeholder="••••••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  className="w-full mt-3 py-3"
                  loading={loading}
                  disabled={loading}
                >
                  Inicializar Nova Conta →
                </Button>

                <div className="pt-2 text-center text-[11px] font-mono text-zinc-500 border-t border-zinc-900">
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setError(''); }}
                    className="hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    Já possui credenciais? <span className="underline decoration-emerald-500/40">Entrar na conta</span>
                  </button>
                </div>
              </>
            )}

            {mode === 'room' && (
              <>
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-300 text-[11px] font-mono leading-relaxed">
                  <span className="font-bold text-emerald-400">⚡ ZERO-LOGIN:</span> Conecte-se diretamente a uma sala temporária ou permanente sem criar e-mail ou registrar senha de conta.
                </div>

                <Input
                  label="Identificador da Sala (URL)"
                  icon="#"
                  placeholder="ex: sala-secreta-42"
                  value={nomeUrl}
                  onChange={(e) => setNomeUrl(e.target.value)}
                  required
                  autoFocus
                />
                <Input
                  label="Nickname Provisório"
                  icon="👤"
                  placeholder="ex: Guest_99"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                />
                <Input
                  label="Senha da Sala (opcional se pública)"
                  icon="🔒"
                  type="password"
                  placeholder="Deixe em branco se a sala for pública"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
                <Button
                  type="submit"
                  className="w-full mt-3 py-3"
                  loading={loading}
                  disabled={loading}
                >
                  Conectar à Sala Direta →
                </Button>

                <div className="pt-2 text-center text-[11px] font-mono text-zinc-500 border-t border-zinc-900">
                  <button
                    type="button"
                    onClick={() => { setMode('register'); setError(''); }}
                    className="hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    Deseja canais permanentes? <span className="underline decoration-emerald-500/40">Criar conta SaaS</span>
                  </button>
                </div>
              </>
            )}
          </form>

          {/* Rodapé de Segurança Minimalista */}
          <div className="pt-3 border-t border-zinc-900/80 text-center">
            <p className="text-[10px] font-mono text-zinc-600 tracking-wider">
              🔒 AES-256 JWT AUTH • SSE HIGH-SPEED • ZERO TELEMETRY
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
