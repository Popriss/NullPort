import React, { useState, useEffect } from 'react';
import {
  fetchWebhooks,
  generateWebhook,
  deleteWebhook,
  fetchAuditLogs,
  exportRoomHistory,
  blockUser
} from '../services/chat';

export default function ModerationDrawer({
  isOpen,
  onClose,
  activeRoom,
  members = [],
  currentUserRole = 'padrao',
  currentUserId,
  onMuteMember,
  onBanMember,
  onRoleChange,
}) {
  const [currentTab, setCurrentTab] = useState('members'); // 'members' | 'webhooks' | 'audit' | 'export'
  const [copied, setCopied] = useState(false);
  
  // Estados para Webhooks
  const [webhooks, setWebhooks] = useState([]);
  const [webhookName, setWebhookName] = useState('');
  const [loadingWebhooks, setLoadingWebhooks] = useState(false);
  const [copiedWebhookId, setCopiedWebhookId] = useState(null);

  // Estados para Audit Trail
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Estados para Exportação Criptografada
  const [exportPassword, setExportPassword] = useState('');
  const [exportFormat, setExportFormat] = useState('json');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportSuccess, setExportSuccess] = useState(false);

  const isModOrAdmin = currentUserRole === 'admin' || currentUserRole === 'mod';
  const isAdmin = currentUserRole === 'admin';

  // Carrega dados quando a aba correspondente é ativada
  useEffect(() => {
    if (!isOpen || !activeRoom?.id) return;

    if (currentTab === 'webhooks' && isAdmin) {
      loadWebhooks();
    } else if (currentTab === 'audit' && isModOrAdmin) {
      loadAudit();
    }
  }, [currentTab, isOpen, activeRoom?.id]);

  const loadWebhooks = async () => {
    if (!activeRoom?.id) return;
    try {
      setLoadingWebhooks(true);
      const data = await fetchWebhooks(activeRoom.id);
      setWebhooks(data);
    } catch (err) {
      console.error("Erro ao carregar webhooks:", err);
    } finally {
      setLoadingWebhooks(false);
    }
  };

  const handleCreateWebhook = async (e) => {
    e.preventDefault();
    if (!activeRoom?.id) return;
    try {
      setLoadingWebhooks(true);
      await generateWebhook(activeRoom.id, webhookName.trim() || "Webhook Externo");
      setWebhookName('');
      await loadWebhooks();
    } catch (err) {
      alert(err.message || "Erro ao gerar webhook");
    } finally {
      setLoadingWebhooks(false);
    }
  };

  const handleDeleteWebhook = async (webhookId) => {
    if (!confirm("Deseja realmente revogar este webhook?")) return;
    try {
      await deleteWebhook(activeRoom.id, webhookId);
      setWebhooks((prev) => prev.filter((w) => w.id !== webhookId));
    } catch (err) {
      alert(err.message || "Erro ao remover webhook");
    }
  };

  const handleCopyWebhookUrl = (webhook) => {
    const fullUrl = `${window.location.origin}${webhook.webhook_url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedWebhookId(webhook.id);
    setTimeout(() => setCopiedWebhookId(null), 2000);
  };

  const loadAudit = async () => {
    if (!activeRoom?.id) return;
    try {
      setLoadingAudit(true);
      const data = await fetchAuditLogs(activeRoom.id, null, 50);
      setAuditLogs(data);
    } catch (err) {
      console.error("Erro ao carregar auditoria:", err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleExportSubmit = async (e) => {
    e.preventDefault();
    if (!exportPassword || exportPassword.length < 4) {
      setExportError("A senha deve ter no mínimo 4 caracteres.");
      return;
    }

    try {
      setExporting(true);
      setExportError('');
      setExportSuccess(false);

      const blob = await exportRoomHistory(activeRoom.id, exportFormat, exportPassword);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nullport_audit_${activeRoom.nome_url || 'room'}.${exportFormat}.enc`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportSuccess(true);
      setExportPassword('');
    } catch (err) {
      setExportError(err.message || "Erro ao exportar histórico");
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  const handleCopyInvite = () => {
    const inviteUrl = `${window.location.origin}/#${activeRoom?.nome_url || ''}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onlineMembers = members.filter((m) => m.is_online);
  const offlineMembers = members.filter((m) => !m.is_online);

  const renderRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            ADMIN
          </span>
        );
      case 'mod':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
            MOD
          </span>
        );
      case 'view':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
            VIEW
          </span>
        );
      default:
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-zinc-800 text-zinc-400 border border-zinc-700/60">
            PADRÃO
          </span>
        );
    }
  };

  const renderMemberRow = (member) => {
    const memberUserId = member.usuario_id || member.id;
    const isSelf = memberUserId === currentUserId;

    return (
      <div
        key={memberUserId}
        className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs transition-all hover:border-zinc-700"
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              member.is_online ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'
            }`}
            title={member.is_online ? 'Online' : 'Offline'}
          />

          <div className="flex flex-col truncate">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-zinc-200 truncate">
                {member.nickname || 'Membro'}
              </span>
              {isSelf && (
                <span className="text-[10px] text-zinc-500 font-mono">(você)</span>
              )}
              {member.is_muted && (
                <span className="text-[10px] text-rose-400 font-bold" title="Silenciado">
                  🔇
                </span>
              )}
            </div>

            <div className="mt-0.5">
              {renderRoleBadge(member.role || 'padrao')}
            </div>
          </div>
        </div>

        {isModOrAdmin && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onMuteMember(memberUserId, !member.is_muted)}
              title={member.is_muted ? 'Desmutar' : 'Silenciar'}
              className={`p-1.5 px-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                member.is_muted
                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {member.is_muted ? 'Desmutar' : 'Mutar'}
            </button>

            {isAdmin && !isSelf && onRoleChange && (
              <select
                value={member.role || 'padrao'}
                onChange={(e) => onRoleChange(memberUserId, e.target.value)}
                title="Alterar cargo"
                className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] font-semibold uppercase rounded-lg px-1.5 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="admin">Admin</option>
                <option value="mod">Mod</option>
                <option value="padrao">Padrão</option>
                <option value="view">View</option>
              </select>
            )}

            {isAdmin && !isSelf && (
              <button
                onClick={() => onBanMember(memberUserId)}
                title="Banir/Remover da sala"
                className="p-1.5 px-2 rounded-lg text-[11px] font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer"
              >
                Banir
              </button>
            )}

            {!isSelf && (
              <button
                onClick={async () => {
                  if (confirm(`Deseja bloquear ${member.nickname || 'este usuário'}?`)) {
                    try {
                      await blockUser(memberUserId);
                      alert(`Usuário ${member.nickname || ''} bloqueado com sucesso.`);
                    } catch (e) {
                      alert(e.message || "Erro ao bloquear");
                    }
                  }
                }}
                title="Bloquear usuário (RF06)"
                className="p-1.5 px-2 rounded-lg text-[11px] font-medium bg-zinc-800 text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300 transition-all cursor-pointer"
              >
                🚫
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200 gpu-layer will-change-transform">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🛡️</span> Governança & Moderação
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                #{activeRoom?.nome_url || 'sala'} — {activeRoom?.titulo || 'NullPort'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded-md text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Abas de Navegação V3 */}
          <div className="flex items-center gap-1 mt-3 p-1 bg-zinc-950/70 border border-zinc-800/80 rounded-xl shrink-0">
            <button
              onClick={() => setCurrentTab('members')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                currentTab === 'members'
                  ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              👥 Membros
            </button>
            {isAdmin && (
              <button
                onClick={() => setCurrentTab('webhooks')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  currentTab === 'webhooks'
                    ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🔗 Webhooks
              </button>
            )}
            <button
              onClick={() => setCurrentTab('audit')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                currentTab === 'audit'
                  ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              📜 Auditoria
            </button>
            {isAdmin && (
              <button
                onClick={() => setCurrentTab('export')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  currentTab === 'export'
                    ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                🔐 Exportar
              </button>
            )}
          </div>

          {/* ABA: MEMBROS */}
          {currentTab === 'members' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="mt-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 shrink-0">
                <span className="text-[11px] text-zinc-400 font-medium block mb-1.5">
                  Link de Acesso Direto
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/#${activeRoom?.nome_url || ''}`}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700/60 text-xs text-zinc-300 select-all font-mono"
                  />
                  <button
                    onClick={handleCopyInvite}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-semibold cursor-pointer"
                  >
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Online — {onlineMembers.length}</span>
                  </h4>
                  {onlineMembers.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-1 pl-4">Nenhum membro online no momento.</p>
                  ) : (
                    <div className="space-y-2">
                      {onlineMembers.map((member) => renderMemberRow(member))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
                    <span>Offline — {offlineMembers.length}</span>
                  </h4>
                  {offlineMembers.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-1 pl-4">Todos os membros estão online.</p>
                  ) : (
                    <div className="space-y-2">
                      {offlineMembers.map((member) => renderMemberRow(member))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ABA: WEBHOOKS ENTRANTES */}
          {currentTab === 'webhooks' && isAdmin && (
            <div className="flex-1 flex flex-col overflow-hidden mt-3">
              <form onSubmit={handleCreateWebhook} className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl shrink-0 space-y-2">
                <span className="text-xs font-semibold text-zinc-300 block">
                  Criar Webhook Token para Alertas Externos
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Nome (ex: GitHub CI, UptimeRobot)"
                    value={webhookName}
                    onChange={(e) => setWebhookName(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700/60 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={loadingWebhooks}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold text-xs hover:bg-emerald-500 transition-all cursor-pointer disabled:opacity-50"
                  >
                    Gerar
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Suporta payloads do GitHub (push/PR), UptimeRobot (pings) e JSON genérico com formatação automática em Markdown.
                </p>
              </form>

              <div className="mt-3 flex-1 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Webhooks Ativos ({webhooks.length})
                </h4>

                {loadingWebhooks && webhooks.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">Carregando webhooks...</p>
                ) : webhooks.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/60 text-center">
                    <p className="text-xs text-zinc-400">Nenhum webhook gerado para esta sala.</p>
                    <p className="text-[11px] text-zinc-600 mt-1">Crie um token acima para receber notificações de serviços externos.</p>
                  </div>
                ) : (
                  webhooks.map((wh) => (
                    <div key={wh.id} className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <span>⚡</span> {wh.nome}
                        </span>
                        <button
                          onClick={() => handleDeleteWebhook(wh.id)}
                          className="text-[11px] text-rose-400 hover:text-rose-300 transition-all cursor-pointer"
                        >
                          Revogar
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}${wh.webhook_url}`}
                          className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300 select-all truncate"
                        />
                        <button
                          onClick={() => handleCopyWebhookUrl(wh)}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium cursor-pointer"
                        >
                          {copiedWebhookId === wh.id ? '✓' : 'Copiar'}
                        </button>
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        POST payload JSON para a URL acima
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ABA: AUDITORIA (AUDIT TRAIL) */}
          {currentTab === 'audit' && (
            <div className="flex-1 flex flex-col overflow-hidden mt-3">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Trilha Imutável de Auditoria
                </span>
                <button
                  onClick={loadAudit}
                  className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  ↻ Atualizar
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                {loadingAudit ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">Carregando registros imutáveis...</p>
                ) : auditLogs.length === 0 ? (
                  <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/60 text-center">
                    <p className="text-xs text-zinc-400">Nenhum evento registrado nesta sala ainda.</p>
                  </div>
                ) : (
                  auditLogs.map((log) => {
                    const actionColors = {
                      role_change: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
                      mute_member: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                      unmute_member: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
                      ban_member: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
                      create_room: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
                      create_subroom: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
                      delete_room: 'border-rose-600/30 bg-rose-600/10 text-rose-300',
                      delete_subroom: 'border-rose-600/30 bg-rose-600/10 text-rose-300',
                    };
                    const badgeClass = actionColors[log.action] || 'border-zinc-700 bg-zinc-800 text-zinc-300';
                    const dateStr = new Date(log.created_at).toLocaleString('pt-BR');

                    return (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border uppercase tracking-wider ${badgeClass}`}>
                            {log.action}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">{dateStr}</span>
                        </div>
                        <p className="text-zinc-300 text-xs">
                          <span className="font-semibold text-emerald-400">{log.actor_nickname || 'Sistema'}</span>{' '}
                          executou em{' '}
                          <span className="font-semibold text-white">{log.target_nickname || log.target_id || 'sala'}</span>
                        </p>
                        {log.detalhes && Object.keys(log.detalhes).length > 0 && (
                          <div className="p-1.5 bg-zinc-900/80 rounded border border-zinc-800 text-[10px] font-mono text-zinc-400">
                            {JSON.stringify(log.detalhes)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ABA: EXPORTAR HISTÓRICO CRIPTOGRAFADO */}
          {currentTab === 'export' && isAdmin && (
            <div className="flex-1 flex flex-col overflow-hidden mt-3">
              <form onSubmit={handleExportSubmit} className="p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-3">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>🔐</span> Exportação Segura do Histórico
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    O histórico de conversas será cifrado com AES-256 e PBKDF2 utilizando a senha definida por você.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">Formato:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setExportFormat('json')}
                      className={`py-1.5 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                        exportFormat === 'json'
                          ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      JSON Estruturado
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat('pdf')}
                      className={`py-1.5 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                        exportFormat === 'pdf'
                          ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                      }`}
                    >
                      PDF Transcript
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">
                    Senha de Criptografia:
                  </label>
                  <input
                    type="password"
                    placeholder="Mínimo 4 caracteres..."
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700/60 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <p className="text-[10px] text-amber-400/80">
                    ⚠️ Guarde esta senha. Ela será estritamente necessária para abrir o arquivo.
                  </p>
                </div>

                {exportError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
                    {exportError}
                  </p>
                )}

                {exportSuccess && (
                  <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg">
                    ✓ Arquivo criptografado baixado com sucesso!
                  </p>
                )}

                <button
                  type="submit"
                  disabled={exporting}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {exporting ? 'Criptografando Histórico...' : 'Baixar Histórico Criptografado'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Rodapé do painel */}
        <div className="pt-3 mt-2 border-t border-zinc-800 text-center shrink-0">
          <p className="text-[11px] text-zinc-500">
            NullPort V3 Enterprise — Governança e auditoria imutável via PostgreSQL e SSE.
          </p>
        </div>
      </div>
    </div>
  );
}
