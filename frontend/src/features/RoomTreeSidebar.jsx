import React, { useState } from 'react';

export default function RoomTreeSidebar({
  rooms,
  activeRoom,
  onSelectRoom,
  onCreateRoom,
  onCreateSubroom,
  user,
  isOpen,
  onClose
}) {
  const [expandedRooms, setExpandedRooms] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalParentId, setModalParentId] = useState(null);
  
  const [formNomeUrl, setFormNomeUrl] = useState('');
  const [formTitulo, setFormTitulo] = useState('');
  const [formSenha, setFormSenha] = useState('');
  const [formTipo, setFormTipo] = useState('temporaria');
  const [formTtl, setFormTtl] = useState(1440); // 24h em minutos
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleExpand = (roomId, e) => {
    e.stopPropagation();
    setExpandedRooms((prev) => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  const openCreateDialog = (parentId = null) => {
    setModalParentId(parentId);
    setFormNomeUrl('');
    setFormTitulo('');
    setFormSenha('');
    setFormTipo(user?.is_site_admin ? 'permanente' : 'temporaria');
    setError('');
    setShowCreateModal(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (modalParentId) {
        await onCreateSubroom(modalParentId, {
          nome_url: formNomeUrl.trim().toLowerCase(),
          titulo: formTitulo.trim(),
          senha: formSenha || null
        });
      } else {
        await onCreateRoom({
          nome_url: formNomeUrl.trim().toLowerCase(),
          titulo: formTitulo.trim(),
          senha: formSenha || null,
          tipo_sala: formTipo,
          ttl_minutes: formTipo === 'temporaria' ? parseInt(formTtl) : null
        });
      }
      setShowCreateModal(false);
    } catch (err) {
      setError(err.message || 'Erro ao criar canal.');
    } finally {
      setLoading(false);
    }
  };

  // Separa as salas raiz (sem parent_id)
  const rootRooms = rooms.filter((r) => !r.parent_id);

  const renderRoomTree = (room, depth = 0) => {
    const isExpanded = !!expandedRooms[room.id];
    const subrooms = rooms.filter((r) => r.parent_id === room.id);
    const hasChildren = subrooms.length > 0;
    const isActive = activeRoom?.id === room.id;

    return (
      <div key={room.id} className="flex flex-col">
        <div
          onClick={() => onSelectRoom(room)}
          style={{ paddingLeft: `${depth * 14 + 12}px` }}
          className={`group flex items-center justify-between py-2 pr-3 rounded-lg text-xs cursor-pointer transition-all ${
            isActive
              ? 'bg-emerald-500/20 text-emerald-300 font-semibold border-l-2 border-emerald-400'
              : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
          }`}
        >
          <div className="flex items-center gap-2 overflow-hidden truncate">
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => toggleExpand(room.id, e)}
                className="w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-zinc-300 text-[10px]"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            {!hasChildren && <span className="text-zinc-600 text-[10px]">#</span>}
            <span className="truncate">{room.titulo || room.nome_url}</span>
            {room.tipo_sala === 'temporaria' && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                TTL
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              title="Criar sub-canal"
              onClick={(e) => {
                e.stopPropagation();
                openCreateDialog(room.id);
              }}
              className="p-1 hover:bg-zinc-700/80 rounded text-zinc-300 text-[10px]"
            >
              +
            </button>
          </div>
        </div>

        {/* Sub-canais recursivos */}
        {hasChildren && isExpanded && (
          <div className="flex flex-col space-y-0.5">
            {subrooms.map((child) => renderRoomTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-zinc-950/95 border-r border-zinc-800 p-4 flex flex-col justify-between transition-transform duration-300 backdrop-blur-md md:static md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header da Sidebar */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-bold text-sm text-zinc-100">Canais & Salas</span>
            </div>
            <button
              onClick={() => openCreateDialog(null)}
              title="Criar nova sala"
              className="p-1 px-2 text-xs font-semibold rounded-md bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 transition-all"
            >
              + Nova
            </button>
          </div>

          {/* Lista de Salas em Árvore */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {rootRooms.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-6">Nenhuma sala disponível.</p>
            ) : (
              rootRooms.map((room) => renderRoomTree(room, 0))
            )}
          </div>
        </div>

        {/* Informações do usuário logado */}
        {user && (
          <div className="pt-3 mt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs">
            <div className="flex flex-col truncate pr-2">
              <span className="font-medium text-zinc-200 truncate">{user.nickname}</span>
              <span className="text-[10px] text-zinc-500 truncate">
                {user.is_site_admin ? '⚡ Admin do Site' : 'Usuário Padrão'}
              </span>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="md:hidden text-zinc-400 hover:text-white p-1 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Modal de Criação de Sala / Sub-canal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">
              {modalParentId ? 'Criar Sub-Canal' : 'Criar Nova Sala'}
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              {modalParentId
                ? 'Canal filho conectado à árvore hierárquica.'
                : 'Defina a URL e o tempo de vida da sala.'}
            </p>

            {error && (
              <div className="p-2 mb-3 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">Título Amigável</label>
                <input
                  type="text"
                  placeholder="ex: Canal Geral Dev"
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Identificador URL</label>
                <input
                  type="text"
                  placeholder="ex: geral-dev"
                  value={formNomeUrl}
                  onChange={(e) => setFormNomeUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Senha Opcional</label>
                <input
                  type="password"
                  placeholder="Deixe em branco para pública"
                  value={formSenha}
                  onChange={(e) => setFormSenha(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {!modalParentId && (
                <>
                  {user?.is_site_admin && (
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">Tipo de Sala</label>
                      <select
                        value={formTipo}
                        onChange={(e) => setFormTipo(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="permanente">Permanente (SaaS / Institucional)</option>
                        <option value="temporaria">Temporária (Efêmera com TTL)</option>
                      </select>
                    </div>
                  )}

                  {formTipo === 'temporaria' && (
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">TTL (Expiração)</label>
                      <select
                        value={formTtl}
                        onChange={(e) => setFormTtl(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-white focus:outline-none focus:border-emerald-500"
                      >
                        <option value="120">2 Horas</option>
                        <option value="720">12 Horas</option>
                        <option value="1440">24 Horas</option>
                      </select>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Criar Canal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
