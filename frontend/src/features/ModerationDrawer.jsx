import React, { useState } from 'react';

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
  const [copied, setCopied] = useState(false);
  const isModOrAdmin = currentUserRole === 'admin' || currentUserRole === 'mod';
  const isAdmin = currentUserRole === 'admin';

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
          {/* Indicador de Status Online / Offline */}
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

        {/* Ações de Moderação */}
        {isModOrAdmin && (
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Botão de Mute/Unmute */}
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

            {/* Dropdown de Cargo (Apenas Admin para outros usuários) */}
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

            {/* Botão de Ban/Remover (Apenas Admin para outros usuários) */}
            {isAdmin && !isSelf && (
              <button
                onClick={() => onBanMember(memberUserId)}
                title="Banir/Remover da sala"
                className="p-1.5 px-2 rounded-lg text-[11px] font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer"
              >
                Banir
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-sm bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-200 gpu-layer will-change-transform">
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800 shrink-0">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🛡️</span> Moderação da Sala
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                {activeRoom?.titulo || activeRoom?.nome_url}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded-md text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Convite */}
          <div className="mt-4 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 shrink-0">
            <span className="text-[11px] text-zinc-400 font-medium block mb-1.5">
              Link de Acesso da Sala
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/#${activeRoom?.nome_url || ''}`}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700/60 text-xs text-zinc-300 select-all"
              />
              <button
                onClick={handleCopyInvite}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-semibold cursor-pointer"
              >
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>

          {/* Listagem de Membros Categorizada (Online vs Offline) */}
          <div className="mt-5 flex-1 overflow-y-auto pr-1 space-y-5 custom-scrollbar">
            {/* Seção Online */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-2.5 flex items-center gap-2">
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

            {/* Seção Offline */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2.5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
                <span>Offline / Demais Membros — {offlineMembers.length}</span>
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

        {/* Rodapé do painel */}
        <div className="pt-4 mt-2 border-t border-zinc-800 text-center shrink-0">
          <p className="text-[11px] text-zinc-500">
            Ações de moderação refletem instantaneamente no chat via RBAC e SSE.
          </p>
        </div>
      </div>
    </div>
  );
}
