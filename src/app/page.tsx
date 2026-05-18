"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  
  // Telegram State
  const [isTelegramEnv, setIsTelegramEnv] = useState(false);

  // Host state
  const [hostNickname, setHostNickname] = useState('');
  const [isHostLoading, setIsHostLoading] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);

  // Join state
  const [joinCode, setJoinCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [isJoinLoading, setIsJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const webApp = (window as any).Telegram.WebApp;
      if (webApp.initData) {
        webApp.ready();
        setIsTelegramEnv(true);
        const tgName = webApp.initDataUnsafe?.user?.first_name;
        if (tgName) {
          setJoinNickname(tgName);
          setHostNickname(tgName);
        }
      }
    }
  }, []);

  const handleHostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostNickname.trim()) return;

    setIsHostLoading(true);
    setHostError(null);

    try {
      // 1. Generate random 4-character alphanumeric uppercase room code
      const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();

      // 2. Insert user
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert([{ nickname: hostNickname.trim(), role: 'Player' }])
        .select()
        .single();

      if (userError) throw userError;

      const userId = userData.id;

      // 3. Insert room
      const { error: roomError } = await supabase
        .from('rooms')
        .insert([{ 
          room_code: roomCode, 
          status: 'Waiting', 
          host_id: userId, 
          users_ids: [userId],
          users_num: 1
        }]);

      if (roomError) throw roomError;

      // 4. Store in localStorage
      localStorage.setItem('room_code', roomCode);
      localStorage.setItem('user_id', userId);

      // 5. Redirect
      router.push(`/room/${roomCode}`);
    } catch (err: any) {
      console.error('Error creating room:', err);
      setHostError(err.message || 'Не удалось создать комнату.');
      setIsHostLoading(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim() || !joinNickname.trim()) return;

    setIsJoinLoading(true);
    setJoinError(null);

    try {
      const formattedCode = joinCode.trim().toUpperCase();

      // 1. Verify room exists and is waiting
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('users_ids, status')
        .eq('room_code', formattedCode)
        .single();

      if (roomError || !roomData || roomData.status !== 'Waiting') {
        throw new Error('Комната не найдена или игра уже началась');
      }

      // 2. Insert new user
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert([{ nickname: joinNickname.trim(), role: 'Player' }])
        .select()
        .single();

      if (userError) throw userError;

      const userId = userData.id;

      // 3. Update room with new user ID
      const newUsersIds = [...(roomData.users_ids || []), userId];
      const { error: updateError } = await supabase
        .from('rooms')
        .update({ users_ids: newUsersIds, users_num: newUsersIds.length })
        .eq('room_code', formattedCode);

      if (updateError) throw updateError;

      // 4. Store in localStorage
      localStorage.setItem('room_code', formattedCode);
      localStorage.setItem('user_id', userId);

      // 5. Redirect
      router.push(`/room/${formattedCode}`);
    } catch (err: any) {
      console.error('Error joining room:', err);
      setJoinError(err.message || 'Ошибка подключения к комнате');
      setIsJoinLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center justify-center p-4 font-sans selection:bg-indigo-500/30">
      <main className="w-full max-w-md space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-br from-white to-neutral-500 bg-clip-text text-transparent">
            Викторина MVP
          </h1>
          <p className="text-neutral-400 text-sm md:text-base">
            Присоединяйтесь к комнате или создайте новую.
          </p>
        </div>

        <div className="space-y-8 bg-neutral-900/50 p-6 md:p-8 rounded-2xl border border-neutral-800 backdrop-blur-sm shadow-2xl">
          {/* Join Room Section */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="h-4 w-1 bg-indigo-500 rounded-full"></span>
              Присоединиться к игре
            </h2>
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label htmlFor="roomCode" className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                  Код комнаты
                </label>
                <input
                  type="text"
                  id="roomCode"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  maxLength={4}
                  placeholder="Например, ABCD"
                  className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono tracking-widest uppercase text-lg"
                  required
                  disabled={isJoinLoading}
                />
              </div>
              <div>
                <label htmlFor="nickname" className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                  Ваше имя
                </label>
                {isTelegramEnv ? (
                  <div className="w-full bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-3 text-indigo-200 font-medium flex items-center gap-2 cursor-not-allowed">
                    <svg className="w-5 h-5 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.888-.662 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                    {joinNickname}
                  </div>
                ) : (
                  <input
                    type="text"
                    id="nickname"
                    value={joinNickname}
                    onChange={(e) => setJoinNickname(e.target.value)}
                    placeholder="Введите ваше имя"
                    className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                    required
                    disabled={isJoinLoading}
                  />
                )}
              </div>
              {joinError && (
                <div className="text-red-400 text-sm font-medium">
                  {joinError}
                </div>
              )}
              <button
                type="submit"
                disabled={isJoinLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3.5 px-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20"
              >
                {isJoinLoading ? 'Подключение...' : 'Войти в комнату'}
              </button>
            </form>
          </section>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-800"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-neutral-900 px-3 text-neutral-500 uppercase tracking-widest">Или</span>
            </div>
          </div>

          {/* Create Room Section */}
          <section className="space-y-4 text-left">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="h-4 w-1 bg-emerald-500 rounded-full"></span>
              Создать игру
            </h2>
            <p className="text-sm text-neutral-400 pb-2">
              Создайте новую комнату и пригласите друзей.
            </p>
            <form onSubmit={handleHostSubmit} className="space-y-4">
              <div>
                <label htmlFor="hostNickname" className="block text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                  Ваше имя
                </label>
                {isTelegramEnv ? (
                  <div className="w-full bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-200 font-medium flex items-center gap-2 cursor-not-allowed">
                    <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.888-.662 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                    {hostNickname}
                  </div>
                ) : (
                  <input
                    type="text"
                    id="hostNickname"
                    value={hostNickname}
                    onChange={(e) => setHostNickname(e.target.value)}
                    placeholder="Введите ваше имя (хост)"
                    className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                    required
                    disabled={isHostLoading}
                  />
                )}
              </div>
              {hostError && (
                <div className="text-red-400 text-sm font-medium">
                  {hostError}
                </div>
              )}
              <button
                type="submit"
                disabled={isHostLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-3.5 px-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
              >
                {isHostLoading ? 'Создание комнаты...' : 'Создать новую комнату'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
