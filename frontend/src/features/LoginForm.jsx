import React, { useState } from 'react';
import Input from '../components/Input';
import Button from '../components/Button';
import GalaxyCanvas from '../components/GalaxyCanvas';
import { loginUser, registerUser, enterRoom, sendOtp, verifyOtp } from '../services/auth';

/**
 * LoginForm — Design Minimalista, Tech & Funcional
 * 
 * Layout Split-Screen 50/50:
 * - Coluna Esquerda: HUD galáctico com métricas tech, tags do sistema e Canvas Galaxy 3D interativo.
 * - Coluna Direita: Console de autenticação minimalista com inputs com ícones, password toggles e switcher rápido.
 */
export default function LoginForm({ onLoginSuccess }) {
  const [mainTab, setMainTab] = useState('account'); // 'account' | 'ephemeral' | 'otp'
  const [accountMode, setAccountMode] = useState('login'); // 'login' | 'register'
  const [loginId, setLoginId] = useState('');
  const [senha, setSenha] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [nomeUrl, setNomeUrl] = useState('');
  
  // Estados para SMS OTP (RF01)
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpStep, setOtpStep] = useState('phone'); // 'phone' | 'verify'
  const [otpNickname, setOtpNickname] = useState('');
  const [otpSuccessMsg, setOtpSuccessMsg] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coldStartNotice, setColdStartNotice] = useState(false);

  // Cold Start Detection: Render Free Tier pode levar até 45s para acordar o container
  React.useEffect(() => {
    let timer;
    if (loading) {
      timer = setTimeout(() => {
        setColdStartNotice(true);
      }, 2500);
    } else {
      setColdStartNotice(false);
    }
    return () => clearTimeout(timer);
  }, [loading]);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mainTab === 'account') {
        if (accountMode === 'login') {
          if (!loginId.trim() || !senha) {
            throw new Error('Informe seu identificador e senha.');
          }
          const data = await loginUser({ login: loginId.trim(), senha });
          onLoginSuccess(data.user);
        } else {
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
        }
      } else if (mainTab === 'ephemeral') {
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
      } else if (mainTab === 'otp') {
        if (otpStep === 'phone') {
          if (!phone.trim()) throw new Error('Informe o número do seu celular.');
          const res = await sendOtp(phone.trim());
          setOtpSuccessMsg(res.message || 'Código SMS enviado com sucesso!');
          setOtpStep('verify');
        } else {
          if (!otpCode.trim()) throw new Error('Informe o código SMS de 6 dígitos.');
          const data = await verifyOtp({
            telefone: phone.trim(),
            codigo: otpCode.trim(),
            nickname: otpNickname.trim() || undefined
          });
          onLoginSuccess(data.user);
        }
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
      <section className="flex-1 min-h-[380px] md:min-h-screen relative overflow-hidden bg-[#050a08]">
        {/* Canvas de Partículas 3D Interativo com máscara alfa progressiva */}
        <GalaxyCanvas
          particleCount={700}
          interactive={true}
          opacity={1.0}
          fadeEdges={true}
        />

        {/* Camada de Fusão Suave: Transição progressiva entre animação e formulário */}
        {/* Desktop: Gradiente horizontal na borda direita (140px-180px) */}
        <div className="hidden md:block pointer-events-none absolute top-0 right-0 h-full w-36 lg:w-48 bg-gradient-to-r from-transparent via-[#050a08]/80 to-[#050a08] z-10" />

        {/* Mobile: Gradiente vertical na borda inferior */}
        <div className="block md:hidden pointer-events-none absolute bottom-0 inset-x-0 h-28 bg-gradient-to-b from-transparent via-[#050a08]/80 to-[#050a08] z-10" />

        {/* Top HUD Flutuante */}
        <div className="absolute top-0 inset-x-0 p-6 md:p-8 flex items-center justify-between pointer-events-none z-20">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-mono text-sm tracking-wider font-bold">⬡ NULLPORT</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              v2.4 // PROTOCOL
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-zinc-500">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>NODE ONLINE</span>
          </div>
        </div>

        {/* Dica Interativa de Cursor (sutil no centro) */}
        <div className="hidden lg:flex absolute top-1/2 left-8 transform -translate-y-1/2 pointer-events-none opacity-40 hover:opacity-100 transition-opacity z-20">
          <div className="border-l border-emerald-500/30 pl-3 py-1 text-[10px] font-mono text-zinc-400 space-y-0.5">
            <p className="text-emerald-400 font-semibold">// 3D GRAVITY FIELD</p>
            <p>Mova o mouse para interagir com a galáxia</p>
          </div>
        </div>

        {/* Conteúdo Central Hero com Tipografia Tech */}
        <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-14 pointer-events-none z-20">
          <div className="max-w-xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>SISTEMA DE MENSAGENS CRIPTOGRAFADAS</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight font-sans">
              Comunicação Efêmera. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
                Zero Rastros Digitais.
              </span>
            </h1>
            <p className="text-sm sm:text-base text-zinc-400 max-w-lg leading-relaxed font-sans">
              Hub descentralizado de chat com salas temporárias autodestrutivas, moderação em tempo real e privacidade estrita.
            </p>

            {/* Badges de Destaque Tecnológico */}
            <div className="pt-2 flex flex-wrap gap-2 text-[11px] font-mono">
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
          <div className="space-y-4">
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
                  {mainTab === 'account'
                    ? (accountMode === 'login' ? 'Entrar na Plataforma' : 'Cadastrar Operador')
                    : mainTab === 'otp'
                    ? 'Autenticação Rápida SMS OTP'
                    : 'Acesso Direto / Sala Efêmera'}
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {mainTab === 'account'
                  ? (accountMode === 'login'
                      ? 'Autentique com suas credenciais para gerenciar seus canais.'
                      : 'Crie uma conta para criar salas permanentes e moderar canais.')
                  : mainTab === 'otp'
                  ? 'Acesso sem senha com envio de código SMS de alta velocidade.'
                  : 'Acesse uma sala temporária diretamente por URL sem criar conta.'}
              </p>
            </div>
          </div>

          {/* Três Abas Principais: 'Minha Conta', 'SMS OTP' e 'Acesso Direto' */}
          <div className="flex rounded-xl bg-black/70 p-1 border border-zinc-800/80 text-xs font-mono gap-1">
            <button
              type="button"
              onClick={() => { setMainTab('account'); setError(''); }}
              className={`flex-1 py-2.5 px-2 rounded-lg font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                mainTab === 'account'
                  ? 'bg-emerald-500 text-[#050a08] shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <span>👤</span>
              <span>Conta</span>
            </button>
            <button
              type="button"
              onClick={() => { setMainTab('otp'); setError(''); }}
              className={`flex-1 py-2.5 px-2 rounded-lg font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                mainTab === 'otp'
                  ? 'bg-emerald-500 text-[#050a08] shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <span>📱</span>
              <span>SMS OTP</span>
            </button>
            <button
              type="button"
              onClick={() => { setMainTab('ephemeral'); setError(''); }}
              className={`flex-1 py-2.5 px-2 rounded-lg font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                mainTab === 'ephemeral'
                  ? 'bg-emerald-500 text-[#050a08] shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
              }`}
            >
              <span>🚪</span>
              <span>Direto</span>
            </button>
          </div>

          {/* Sub-seletor dentro de 'Minha Conta': Entrar vs Cadastrar */}
          {mainTab === 'account' && (
            <div className="flex rounded-lg bg-zinc-900/70 p-1 border border-zinc-800/90 text-xs font-mono">
              <button
                type="button"
                onClick={() => { setAccountMode('login'); setError(''); }}
                className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                  accountMode === 'login'
                    ? 'bg-zinc-800 text-emerald-300 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🔐 Entrar
              </button>
              <button
                type="button"
                onClick={() => { setAccountMode('register'); setError(''); }}
                className={`flex-1 py-1.5 rounded-md font-medium transition-all ${
                  accountMode === 'register'
                    ? 'bg-zinc-800 text-emerald-300 font-bold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                ⚡ Criar Conta
              </button>
            </div>
          )}

          {/* Spinner e Indicador de Cold Start (Render Free Tier) */}
          {loading && coldStartNotice && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-start gap-3 animate-pulse">
              <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-200">Inicializando container na nuvem...</p>
                <p className="text-[11px] text-amber-400/80 leading-relaxed">
                  O servidor no Render Free Tier hiberna após inatividade. O primeiro acesso pode levar até 45 segundos para responder.
                </p>
              </div>
            </div>
          )}

          {/* Alerta de Erro Monospace */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-start gap-2">
              <span className="text-rose-400 font-bold">[ERRO]</span>
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Formulários por Modo */}
          <form onSubmit={handleAuth} className="space-y-4">
            {mainTab === 'account' && accountMode === 'login' && (
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
                    onClick={() => { setAccountMode('register'); setError(''); }}
                    className="hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    Não tem conta? <span className="underline decoration-emerald-500/40">Criar agora</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMainTab('ephemeral'); setError(''); }}
                    className="hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    Entrar em sala sem login →
                  </button>
                </div>
              </>
            )}

            {mainTab === 'account' && accountMode === 'register' && (
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
                    onClick={() => { setAccountMode('login'); setError(''); }}
                    className="hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    Já possui credenciais? <span className="underline decoration-emerald-500/40">Entrar na conta</span>
                  </button>
                </div>
              </>
            )}

            {mainTab === 'otp' && (
              <>
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-300 text-[11px] font-mono leading-relaxed">
                  <span className="font-bold text-emerald-400">⚡ SMS RÁPIDO:</span> Autentique-se via código único de 6 dígitos enviado ao seu celular. Se o número não for cadastrado, uma nova conta será provisionada instantaneamente.
                </div>

                {otpSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
                    <span>✓</span>
                    <span>{otpSuccessMsg}</span>
                  </div>
                )}

                {otpStep === 'phone' ? (
                  <>
                    <Input
                      label="Número de Telefone Celular"
                      icon="📱"
                      type="tel"
                      placeholder="+55 11 99999-8888"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      autoFocus
                    />
                    <Button
                      type="submit"
                      className="w-full mt-3 py-3"
                      loading={loading}
                      disabled={loading}
                    >
                      Enviar Código por SMS →
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      label="Código de Confirmação SMS (6 dígitos)"
                      icon="🔑"
                      placeholder="ex: 123456"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      maxLength={6}
                      required
                      autoFocus
                    />
                    <Input
                      label="Seu Nickname (opcional para novos cadastros)"
                      icon="👤"
                      placeholder="ex: CyberAgent"
                      value={otpNickname}
                      onChange={(e) => setOtpNickname(e.target.value)}
                    />
                    <Button
                      type="submit"
                      className="w-full mt-3 py-3"
                      loading={loading}
                      disabled={loading}
                    >
                      Validar Código e Entrar →
                    </Button>
                    <div className="pt-2 text-center text-[11px] font-mono text-zinc-500">
                      <button
                        type="button"
                        onClick={() => { setOtpStep('phone'); setOtpCode(''); setOtpSuccessMsg(''); setError(''); }}
                        className="hover:text-emerald-400 transition-colors cursor-pointer"
                      >
                        ← Alterar número de telefone
                      </button>
                    </div>
                  </>
                )}

                <div className="pt-2 text-center text-[11px] font-mono text-zinc-500 border-t border-zinc-900">
                  <button
                    type="button"
                    onClick={() => { setMainTab('account'); setError(''); }}
                    className="hover:text-emerald-400 transition-colors cursor-pointer"
                  >
                    Prefere entrar com e-mail e senha? <span className="underline decoration-emerald-500/40">Entrar com credenciais</span>
                  </button>
                </div>
              </>
            )}

            {mainTab === 'ephemeral' && (
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
                    onClick={() => { setMainTab('account'); setAccountMode('register'); setError(''); }}
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
