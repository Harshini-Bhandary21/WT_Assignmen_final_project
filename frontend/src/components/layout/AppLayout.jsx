import React, { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { io } from 'socket.io-client';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import LiveWidget from './LiveWidget';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';

const AppLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user, updateUser } = useAuth();
  const [online, setOnline] = useState(1);
  const [board, setBoard] = useState([]);
  const [syncKey, setSyncKey] = useState(0);
  const timer = useRef();

  // Realtime: server pushes 'sync' after any write -> refresh user + remount page so it refetches
  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL).origin : '/', {
      auth: { token: localStorage.getItem('levelup_token') }
    });
    socket.on('presence', setOnline);
    socket.on('leaderboard', setBoard);
    socket.on('sync', () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try { updateUser((await authAPI.getMe()).data.user); } catch {}
        setSyncKey((k) => k + 1);
      }, 400);
    });
    return () => socket.disconnect();
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet key={syncKey} />
        </main>
      </div>
      <LiveWidget online={online} board={board} meId={user?._id || user?.id} />
    </div>
  );
};

export default AppLayout;
