import React, { useEffect, useState } from 'react';
import { listSessions, revokeSession, revokeOtherSessions, deleteAccount, exportUserData } from '../services/auth';
import { fetchBlockedUsers, unblockUser } from '../services/chat';
import { formatMessageTime, formatMessageDate } from '../utils/date';

export default function SecuritySettingsModal({ isOpen, onClose, onAccountDeleted }) {
  const [activeTab, setActiveTab] = useState('sessions'); // 'sessions' | 'blocked' | 'lgpd'
  const [sessions, setSessions] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Form LGPD
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    try {
      setExporting(true);
      setError(null);
      const data = await exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nullport_meus_dados_lgpd_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage('Exportação LGPD concluída com sucesso.');
    } catch (err) {
      setError(err.message || 'Falha ao exportar dados.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, activeTab]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'sessions') {
        const data = await listSessions();
        setSessions(data || []);
      } else if (activeTab === 'blocked') {
        const data = await fetchBlockedUsers();
        setBlockedUsers(data || []);
      }
    } catch (err) {
      setError(err.message || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }

  const handleRevokeSession = async (sessionId) => {
    try {
      await revokeSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      setMessage('Dispositivo desconectado com sucesso.');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeOthers = async () => {
    try {
      await revokeOtherSessions();
      setSessions(prev => prev.filter(s => s.is_current));
      setMessage('Todas as outras sessões foram encerradas.');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUnblock = async (userId) => {
    try {
      await unblockUser(userId);
      setBlockedUsers(prev => prev.filter(u => u.bloqueado_id !== userId));
      setMessage('Usuário desbloqueado com sucesso.');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (confirmText !== 'EXCLUIR MINHA CONTA') {
      setError('Digite a frase exata de confirmação para prosseguir.');
      return;
    }
    if (!deletePassword) {
      setError('Informe sua senha atual.');
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      await deleteAccount(deletePassword);
      onAccountDeleted?.();
      onClose();
    } catch (err) {
      setError(err.message || 'Erro ao excluir conta.');
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(5, 8, 18, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#0b1120'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>🛡️</span>
            <div>
              <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: '16px' }}>
                Central de Segurança & Privacidade
              </div>
              <div style={{ color: '#64748b', fontSize: '12px' }}>
                Governança LGPD, sessões e proteção ativa
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Abas */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            backgroundColor: '#0a0f1d'
          }}
        >
          <button
            onClick={() => setActiveTab('sessions')}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: activeTab === 'sessions' ? '#0f172a' : 'transparent',
              color: activeTab === 'sessions' ? '#10b981' : '#94a3b8',
              border: 'none',
              borderBottom: activeTab === 'sessions' ? '2px solid #10b981' : 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            💻 Dispositivos ({sessions.length})
          </button>
          <button
            onClick={() => setActiveTab('blocked')}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: activeTab === 'blocked' ? '#0f172a' : 'transparent',
              color: activeTab === 'blocked' ? '#10b981' : '#94a3b8',
              border: 'none',
              borderBottom: activeTab === 'blocked' ? '2px solid #10b981' : 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            🚫 Bloqueados ({blockedUsers.length})
          </button>
          <button
            onClick={() => setActiveTab('lgpd')}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: activeTab === 'lgpd' ? '#0f172a' : 'transparent',
              color: activeTab === 'lgpd' ? '#ef4444' : '#94a3b8',
              border: 'none',
              borderBottom: activeTab === 'lgpd' ? '2px solid #ef4444' : 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            🗑️ Exclusão LGPD
          </button>
        </div>

        {/* Alertas */}
        {message && (
          <div
            style={{
              margin: '12px 20px 0',
              padding: '10px 14px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              fontSize: '13px',
              borderRadius: '8px'
            }}
          >
            ✓ {message}
          </div>
        )}
        {error && (
          <div
            style={{
              margin: '12px 20px 0',
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '13px',
              borderRadius: '8px'
            }}
          >
            ✕ {error}
          </div>
        )}

        {/* Conteúdo das Abas */}
        <div style={{ padding: '20px', maxHeight: '420px', overflowY: 'auto' }}>
          {/* Aba 1: Sessões Ativas (RF01) */}
          {activeTab === 'sessions' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px'
                }}
              >
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                  Gerencie os navegadores e apps conectados à sua conta:
                </span>
                {sessions.length > 1 && (
                  <button
                    onClick={handleRevokeOthers}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Desconectar Outros
                  </button>
                )}
              </div>

              {loading && <div style={{ color: '#64748b', fontSize: '13px' }}>Carregando sessões...</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sessions.map(s => (
                  <div
                    key={s.id}
                    style={{
                      backgroundColor: '#1e293b',
                      border: s.is_current ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '10px',
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#f8fafc', fontWeight: 600, fontSize: '14px' }}>
                          {s.device_name}
                        </span>
                        {s.is_current && (
                          <span
                            style={{
                              backgroundColor: 'rgba(16, 185, 129, 0.2)',
                              color: '#34d399',
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}
                          >
                            Este Dispositivo
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>
                        IP: {s.ip_address || '127.0.0.1'} • Visto em: {formatMessageTime(s.last_active_at)}
                      </div>
                    </div>

                    {!s.is_current && (
                      <button
                        onClick={() => handleRevokeSession(s.id)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: 'none',
                          color: '#f87171',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Encerrar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aba 2: Bloqueados (RF06) */}
          {activeTab === 'blocked' && (
            <div>
              <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '14px' }}>
                Usuários bloqueados não podem enviar mensagens para você:
              </div>

              {loading && <div style={{ color: '#64748b', fontSize: '13px' }}>Carregando bloqueios...</div>}

              {blockedUsers.length === 0 && !loading && (
                <div style={{ color: '#64748b', fontSize: '13px', textAlign: 'center', padding: '30px' }}>
                  Nenhum usuário bloqueado no momento.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {blockedUsers.map(u => (
                  <div
                    key={u.id}
                    style={{
                      backgroundColor: '#1e293b',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: '13px' }}>
                        @{u.nickname}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '11px' }}>
                        Bloqueado em {formatMessageDate(u.created_at)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnblock(u.bloqueado_id)}
                      style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34d399',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Desbloquear
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aba 3: LGPD e Portabilidade (RN06) */}
          {activeTab === 'lgpd' && (
            <div>
              {/* Portabilidade de Dados */}
              <div
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '14px',
                  borderRadius: '10px',
                  marginBottom: '20px'
                }}
              >
                <div style={{ color: '#34d399', fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>
                  📦 Portabilidade de Dados Pessoais (LGPD Art. 18)
                </div>
                <div style={{ color: '#94a3b8', fontSize: '12px', lineHeight: '1.5', marginBottom: '12px' }}>
                  Baixe uma cópia completa e legível dos seus dados cadastrais, salas administradas e estatísticas em formato JSON padronizado.
                </div>
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={exporting}
                  style={{
                    backgroundColor: '#10b981',
                    color: '#050a08',
                    fontWeight: 700,
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '12px',
                    cursor: exporting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {exporting ? 'Gerando arquivo...' : '📥 Baixar Meus Dados (.JSON)'}
                </button>
              </div>

              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '14px',
                  borderRadius: '10px',
                  marginBottom: '16px'
                }}
              >
                <div style={{ color: '#f87171', fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>
                  ⚠️ Zona de Perigo: Exclusão Definitiva (LGPD Art. 18)
                </div>
                <div style={{ color: '#fca5a5', fontSize: '12px', lineHeight: '1.5' }}>
                  Esta ação é irreversível. Todos os seus dados, mensagens com retenção, mídias no Cloudflare R2, salas criadas e sessões ativas serão permanentemente destruídos (Hard Wipe).
                </div>
              </div>

              <form onSubmit={handleDeleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                    Sua Senha Atual:
                  </label>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Digite sua senha"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#1e293b',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                    Para confirmar, digite <strong>EXCLUIR MINHA CONTA</strong>:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="EXCLUIR MINHA CONTA"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#1e293b',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '13px'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={deleting}
                  style={{
                    marginTop: '8px',
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)'
                  }}
                >
                  {deleting ? 'Destruindo dados...' : 'Excluir Minha Conta Permanentemente'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
