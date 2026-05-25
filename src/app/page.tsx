"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';

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

  // Main navigation tab states
  const [mainTab, setMainTab] = useState<'game' | 'rules' | 'feedback'>('game');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) return;

    setIsSubmittingFeedback(true);
    setFeedbackError(null);

    try {
      const generatedUserId = (isTelegramEnv && telegramUserId) 
        ? telegramUserId 
        : localStorage.getItem('user_id') || null;

      const { error } = await supabase
        .from('feedback')
        .insert([{
          user_id: generatedUserId,
          message: feedbackMessage.trim()
        }]);

      if (error) throw error;

      setFeedbackSuccess(true);
      setFeedbackMessage('');
    } catch (err: any) {
      console.error('Error sending feedback:', err);
      setFeedbackError(err.message || 'Не удалось отправить отзыв. Попробуйте еще раз.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

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
      <main className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4 flex flex-col items-center">
          <Image 
            src="https://zboparcletaettrhjzyw.supabase.co/storage/v1/object/public/public-assets/SunSet%20Glow.png"
            alt="Викторина MVP"
            width={256}
            height={256}
            className="w-48 md:w-56 h-auto"
            priority
          />
          <p className="text-neutral-400 text-sm md:text-base">
            Присоединяйтесь к комнате или создайте новую.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-neutral-900/80 p-1.5 rounded-2xl border border-neutral-800/80 backdrop-blur-md w-full justify-between items-center shadow-lg relative z-20">
          <button
            onClick={() => setMainTab('game')}
            className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
              mainTab === 'game'
                ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-500/30'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            🎮 Играть
          </button>
          <button
            onClick={() => setMainTab('rules')}
            className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
              mainTab === 'rules'
                ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-500/30'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            📜 Правила
          </button>
          <button
            onClick={() => setMainTab('feedback')}
            className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
              mainTab === 'feedback'
                ? 'bg-indigo-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] border border-indigo-500/30'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            💬 Отзывы
          </button>
        </div>

        <AnimatePresence mode="wait">
          {mainTab === 'game' && (
            <motion.div
              key="game-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="w-full space-y-6"
            >
              <div className="space-y-6 bg-neutral-900/50 p-6 md:p-8 rounded-2xl border border-neutral-800 backdrop-blur-sm shadow-2xl">
                {/* Tabs */}
                <div className="flex bg-neutral-950 rounded-xl p-1 border border-neutral-800/80">
                  <button
                    onClick={() => setActiveTab('join')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                      activeTab === 'join' 
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    Присоединиться
                  </button>
                  <button
                    onClick={() => setActiveTab('host')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
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
                          className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all font-mono font-black tracking-widest uppercase text-lg text-center"
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
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3.5 px-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20 cursor-pointer"
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
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-3.5 px-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 cursor-pointer"
                      >
                        {isHostLoading ? 'Создание комнаты...' : 'Создать новую комнату'}
                      </button>
                    </form>
                  </section>
                )}
              </div>
            </motion.div>
          )}

          {mainTab === 'rules' && (
            <motion.div
              key="rules-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <div className="bg-neutral-900/60 p-6 md:p-8 rounded-3xl border border-neutral-800/80 shadow-2xl backdrop-blur-md space-y-6 text-left">
                <h2 className="text-2xl font-black text-white flex items-center gap-3 border-b border-neutral-800 pb-4">
                  <span className="text-indigo-400 text-3xl">📜</span> Правила игры JXOVO
                </h2>
                
                <div className="space-y-6 text-neutral-300">
                  <div className="flex gap-4 items-start">
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-lg border border-indigo-500/20 flex-shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base uppercase tracking-wider mb-1">Присоединяйтесь к комнате</h3>
                      <p className="text-sm text-neutral-400">
                        Пригласите друзей в комнату, поделившись с ними уникальным кодом или ссылкой. Вы также можете играть с умными ботами, если вам не хватает компании!
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-lg border border-indigo-500/20 flex-shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base uppercase tracking-wider mb-1">Отвечайте на вопросы</h3>
                      <p className="text-sm text-neutral-400">
                        Каждый раунд игра задает каверзный или забавный вопрос. Придумайте самый оригинальный, неожиданный или смешной ответ и отправьте его до истечения таймера.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-lg border border-indigo-500/20 flex-shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base uppercase tracking-wider mb-1">Голосуйте за лучшие ответы</h3>
                      <p className="text-sm text-neutral-400">
                        Все присланные ответы перемешиваются и показываются анонимно. Голосуйте за тот вариант, который рассмешил вас больше всего! За свой ответ голосовать нельзя.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start">
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-lg border border-indigo-500/20 flex-shrink-0 mt-0.5">
                      4
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-base uppercase tracking-wider mb-1">Зарабатывайте очки и побеждайте</h3>
                      <p className="text-sm text-neutral-400">
                        Получайте очки за каждый голос, отданный за ваш ответ. Игра длится 3 раунда, по итогам которых определяется абсолютный чемпион юмора и находчивости!
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-900/10 border border-indigo-500/20 p-5 rounded-2xl mt-4">
                  <div className="flex gap-3">
                    <span className="text-2xl flex-shrink-0">⚡</span>
                    <p className="text-xs text-indigo-300 font-medium leading-relaxed">
                      Совет: не будьте слишком серьезными! В JXOVO побеждают самые смешные, ироничные и безумные ответы. Дайте волю своей фантазии!
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {mainTab === 'feedback' && (
            <motion.div
              key="feedback-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <div className="bg-neutral-900/60 p-6 md:p-8 rounded-3xl border border-neutral-800/80 shadow-2xl backdrop-blur-md space-y-6 text-left">
                <h2 className="text-2xl font-black text-white flex items-center gap-3 border-b border-neutral-800 pb-4">
                  <span className="text-indigo-400 text-3xl">💬</span> Отзывы и предложения
                </h2>

                {feedbackSuccess ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-8 text-center space-y-5"
                  >
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="space-y-2 max-w-md">
                      <h3 className="text-xl font-bold text-white">Отзыв отправлен!</h3>
                      <p className="text-neutral-300 text-sm leading-relaxed font-medium">
                        Спасибо большое за ваше внимание к развитию проекта. Мы обязательно познакомимся и возможно, что-то предпримем.
                      </p>
                    </div>
                    <button
                      onClick={() => setFeedbackSuccess(false)}
                      className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl border border-neutral-700/60 transition-colors cursor-pointer"
                    >
                      Отправить еще один отзыв
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleFeedbackSubmit} className="space-y-5">
                    <p className="text-sm text-neutral-400 leading-relaxed font-medium">
                      Поделитесь своим мнением, расскажите о найденных багах или предложите новые идеи для игры. Мы внимательно читаем каждое сообщение!
                    </p>

                    <div>
                      <label htmlFor="feedback-textarea" className="block text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider pl-1">
                        Ваше сообщение
                      </label>
                      <textarea
                        id="feedback-textarea"
                        value={feedbackMessage}
                        onChange={(e) => setFeedbackMessage(e.target.value)}
                        placeholder="Напишите здесь всё, что вы думаете о проекте..."
                        rows={5}
                        required
                        disabled={isSubmittingFeedback}
                        className="w-full bg-neutral-950/60 border border-neutral-700/80 rounded-2xl px-5 py-4 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm leading-relaxed shadow-inner resize-none font-sans"
                      />
                    </div>

                    {feedbackError && (
                      <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl font-medium">
                        ⚠️ {feedbackError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmittingFeedback || !feedbackMessage.trim()}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-6 rounded-2xl transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(79,70,229,0.2)] text-base cursor-pointer"
                    >
                      {isSubmittingFeedback ? 'Отправка...' : 'Отправить'}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
