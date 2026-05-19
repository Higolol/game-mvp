"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  
  // Telegram State
  const [isTelegramEnv, setIsTelegramEnv] = useState(false);
  const [telegramUserId, setTelegramUserId] = useState<string | null>(null);

  // Host state
  const [hostNickname, setHostNickname] = useState('');
  const [isHostLoading, setIsHostLoading] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);

  // Join state
  const [joinCode, setJoinCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [isJoinLoading, setIsJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'join' | 'host'>('join');

  useEffect(() => {
    let deepLinkRoomCode: string | null = null;
    
    // Check Web URL param
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      deepLinkRoomCode = urlParams.get('room');
    }

    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const webApp = (window as any).Telegram.WebApp;
      if (webApp.initData) {
        webApp.ready();
        setIsTelegramEnv(true);
        const tgUser = webApp.initDataUnsafe?.user;
        if (tgUser) {
          if (tgUser.first_name) {
            setJoinNickname(tgUser.first_name);
            setHostNickname(tgUser.first_name);
          }
          if (tgUser.id) {
            setTelegramUserId(String(tgUser.id));
          }
        }
        // Check Telegram start_param
        if (webApp.initDataUnsafe?.start_param) {
          deepLinkRoomCode = webApp.initDataUnsafe.start_param;
        }
      }
    }

    if (deepLinkRoomCode) {
      setJoinCode(deepLinkRoomCode);
      setActiveTab('join');
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

      const generatedId = (isTelegramEnv && telegramUserId) 
        ? telegramUserId 
        : crypto.randomUUID();

      // 2. Upsert user
      const { data: userData, error: userError } = await supabase
        .from('players')
        .upsert([{ id: generatedId, nickname: hostNickname.trim() }])
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

      const generatedId = (isTelegramEnv && telegramUserId) 
        ? telegramUserId 
        : crypto.randomUUID();

      // 2. Upsert new user
      const { data: userData, error: userError } = await supabase
        .from('players')
        .upsert([{ id: generatedId, nickname: joinNickname.trim() }])
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

        <div className="space-y-6 bg-neutral-900/50 p-6 md:p-8 rounded-2xl border border-neutral-800 backdrop-blur-sm shadow-2xl">
          {/* Tabs */}
          <div className="flex bg-neutral-950 rounded-xl p-1 border border-neutral-800/80">
            <button
              onClick={() => setActiveTab('join')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'join' 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Присоединиться
            </button>
            <button
              onClick={() => setActiveTab('host')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'host' 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' 
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Создать игру
            </button>
          </div>

          {activeTab === 'join' ? (
            /* Join Room Section */
            <section className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <span className="h-4 w-1 bg-indigo-500 rounded-full"></span>
                Вход в лобби
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
          ) : (
            /* Create Room Section */
            <section className="space-y-4 text-left animate-in fade-in zoom-in-95 duration-200">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <span className="h-4 w-1 bg-emerald-500 rounded-full"></span>
                Новая игра
              </h2>
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
          )}
        </div>

        {/* Game Rules Section */}
        <div className="bg-neutral-900/40 p-6 md:p-8 rounded-2xl border border-neutral-800/60 backdrop-blur-sm text-sm text-neutral-300 shadow-xl space-y-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">📜</span> Правила игры
          </h3>
          <ul className="space-y-4">
            <li className="flex gap-3 items-start">
              <span className="text-indigo-400 text-lg mt-0.5">✦</span>
              <span className="leading-relaxed">Отвечайте на вопросы — чем смешнее, тем лучше.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="text-indigo-400 text-lg mt-0.5">✦</span>
              <span className="leading-relaxed">После каждого раунда все ответы попадают на общее голосование.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="text-indigo-400 text-lg mt-0.5">✦</span>
              <span className="leading-relaxed">Игра длится 3 раунда, побеждает самый смешной игрок по общему голосованию.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="text-indigo-400 text-lg mt-0.5">✦</span>
              <span className="leading-relaxed">Не хватает игроков? Добавьте ботов — они тоже участвуют и отвечают.</span>
            </li>
            <li className="flex gap-3 items-start">
              <span className="text-indigo-400 text-lg mt-0.5">✦</span>
              <span className="leading-relaxed">Получайте удовольствие и не бойтесь быть креативными!</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
