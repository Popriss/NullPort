import React, { useState, useEffect } from 'react';
import LoginForm from './features/LoginForm';
import ChatBox from './features/ChatBox';
import RoomTreeSidebar from './features/RoomTreeSidebar';
import { getCurrentUser, getMe, logout } from './services/auth';
import { fetchRooms, createRoom, createSubroom } from './services/chat';

export default function App() {
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Inicializa sessão
  useEffect(() => {
    const initSession = async () => {
      const savedUser = getCurrentUser();
      if (savedUser) {
        setUser(savedUser);
        // Atualiza perfil caso tenha mudado no backend
        const refreshed = await getMe();
        if (refreshed) setUser(refreshed);
      }
      setLoading(false);
    };
    initSession();
  }, []);

  // Carrega salas quando o usuário estiver logado
  const loadRooms = async () => {
    try {
      const roomsData = await fetchRooms();
      setRooms(roomsData);
      // Se não tiver sala ativa selecionada, seleciona a primeira
      if (roomsData.length > 0 && !activeRoom) {
        setActiveRoom(roomsData[0]);
      }
    } catch (err) {
      console.error("Erro ao carregar salas:", err);
    }
  };

  useEffect(() => {
    if (user && !user.is_legacy_room) {
      loadRooms();
    }
  }, [user]);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    if (userData.is_legacy_room) {
      setActiveRoom({
        id: userData.sala_id,
        nome_url: userData.nome_url,
        titulo: userData.nome_url,
      });
    }
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setRooms([]);
    setActiveRoom(null);
  };

  const handleCreateRoom = async (roomData) => {
    const newRoom = await createRoom(roomData);
    setRooms((prev) => [newRoom, ...prev]);
    setActiveRoom(newRoom);
  };

  const handleCreateSubroom = async (parentId, subData) => {
    const newSub = await createSubroom(parentId, subData);
    setRooms((prev) => [...prev, newSub]);
    setActiveRoom(newSub);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400 text-xs">
        <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping mr-3"></span>
        Iniciando NullPort...
      </div>
    );
  }

  return (
    <main className="min-h-screen flex bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100 font-sans">
      {!user ? (
        <div className="flex-1 flex flex-col justify-center items-center p-4">
          <LoginForm onLoginSuccess={handleLoginSuccess} />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Hierárquica em Árvore */}
          {!user.is_legacy_room && (
            <RoomTreeSidebar
              rooms={rooms}
              activeRoom={activeRoom}
              onSelectRoom={(room) => {
                setActiveRoom(room);
                setIsSidebarOpen(false);
              }}
              onCreateRoom={handleCreateRoom}
              onCreateSubroom={handleCreateSubroom}
              user={user}
              isOpen={isSidebarOpen}
              onClose={() => setIsSidebarOpen(false)}
            />
          )}

          {/* Área Principal de Chat */}
          <div className="flex-1 flex flex-col justify-center items-center p-2 md:p-6 overflow-hidden">
            <ChatBox
              user={user}
              activeRoom={activeRoom}
              onLogout={handleLogout}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
