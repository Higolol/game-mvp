"use client";

import React, { use, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';

function useSoundEffect(url: string) {
  const audio = useMemo(() => {
    if (typeof window !== 'undefined') {
      const a = new Audio(url);
      a.preload = 'auto';
      return a;
    }
    return null;
  }, [url]);

  const play = useCallback(() => {
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn("Audio playback failed or was blocked by browser autoplay policy:", err);
      });
    }
  }, [audio]);

  return play;
}

function useGameMusic(status: string | undefined) {
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('jxovo_music_muted') === 'true';
    }
    return false;
  });

  const lobbyAudioRef = useRef<HTMLAudioElement | null>(null);
  const resultsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio elements
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const lobbyAudio = new Audio('https://zboparcletaettrhjzyw.supabase.co/storage/v1/object/public/public-assets/Cleo%20Francis,%20Ellis%20Kent%20-%20Get%20The%20Bleep%20Up.mp3');
    lobbyAudio.loop = true;
    lobbyAudio.preload = 'auto';

    const resultsAudio = new Audio('https://zboparcletaettrhjzyw.supabase.co/storage/v1/object/public/public-assets/Cleo%20Francis,%20Ellis%20Kent%20-%20Space%20Walk%20West.mp3');
    resultsAudio.loop = true;
    resultsAudio.preload = 'auto';

    lobbyAudioRef.current = lobbyAudio;
    resultsAudioRef.current = resultsAudio;

    return () => {
      lobbyAudio.pause();
      resultsAudio.pause();
    };
  }, []);

  // Sync mute state
  useEffect(() => {
    if (lobbyAudioRef.current) lobbyAudioRef.current.muted = isMuted;
    if (resultsAudioRef.current) resultsAudioRef.current.muted = isMuted;
  }, [isMuted]);

  // Handle music state transitions based on room status
  useEffect(() => {
    const lobbyAudio = lobbyAudioRef.current;
    const resultsAudio = resultsAudioRef.current;
    if (!lobbyAudio || !resultsAudio) return;

    const isResultsState = status === 'Round Results' || status === 'Leaderboard';

    if (isResultsState) {
      lobbyAudio.pause();
      if (!isMuted) {
        resultsAudio.play().catch(() => {
          // Blocked initially until interaction
        });
      }
    } else {
      resultsAudio.pause();
      if (!isMuted) {
        lobbyAudio.play().catch(() => {
          // Blocked initially until interaction
        });
      }
    }
  }, [status, isMuted]);

  // Global interaction listener to resume audio if initially blocked by browser policy
  useEffect(() => {
    const handleInteraction = () => {
      const lobbyAudio = lobbyAudioRef.current;
      const resultsAudio = resultsAudioRef.current;
      if (!lobbyAudio || !resultsAudio || isMuted) return;

      const isResultsState = status === 'Round Results' || status === 'Leaderboard';

      if (isResultsState && resultsAudio.paused) {
        resultsAudio.play().catch(() => {});
      } else if (!isResultsState && lobbyAudio.paused) {
        lobbyAudio.play().catch(() => {});
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleInteraction, { once: true });
      window.addEventListener('touchstart', handleInteraction, { once: true });
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('click', handleInteraction);
        window.removeEventListener('touchstart', handleInteraction);
      }
    };
  }, [status, isMuted]);

  const toggleMute = () => {
    setIsMuted(prev => {
      const newMute = !prev;
      localStorage.setItem('jxovo_music_muted', String(newMute));
      return newMute;
    });
  };

  return { isMuted, toggleMute };
}

interface Player {
  id: string;
  nickname: string;
  role: string;
}

interface RoomData {
  room_code: string;
  host_id: string;
  status: string;
  users_ids: string[];
  current_question_id?: string | null;
  current_round?: number;
}

interface QuestionData {
  id: string;
  question_text: string;
  fake_answers?: string[];
}

interface AnswerData {
  id: string;
  user_id: string;
  answer_text: string;
}

interface VoteResult {
  answer_id: string;
  answer_text: string;
  author_id: string;
  author_nickname: string;
  author_role: string;
  votes: number;
}

export default function RoomLobby({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = use(params);
  const router = useRouter();
  
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hasCopied, setHasCopied] = useState(false);
  const [isAddingBot, setIsAddingBot] = useState(false);
  const [customBotName, setCustomBotName] = useState("");

  // Round 1 States
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [submittedAnswersCount, setSubmittedAnswersCount] = useState(0);

  // Voting States
  const [votingOptions, setVotingOptions] = useState<AnswerData[]>([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [submittedVotesCount, setSubmittedVotesCount] = useState(0);
  const botsVotedRef = useRef(false);

  // Results State
  const [roundResults, setRoundResults] = useState<VoteResult[]>([]);

  // Session State
  const [sessionScores, setSessionScores] = useState<Record<string, number>>({});
  const [roundWinners, setRoundWinners] = useState<Record<number, string>>({});
  const playedQuestionsRef = useRef<string[]>([]);
  const hasSavedResultsRef = useRef(false);
  const scoredRoundsRef = useRef<Set<number>>(new Set());

  const [qrSource, setQrSource] = useState<'web' | 'tg'>('web');
  const [qrCopied, setQrCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [selectedVoteId, setSelectedVoteId] = useState<string | null>(null);
  const [isAnswerSubmittedClicked, setIsAnswerSubmittedClicked] = useState(false);

  const playWhoosh = useSoundEffect('https://zboparcletaettrhjzyw.supabase.co/storage/v1/object/public/public-assets/fireball-whoosh_gknwssnu.mp3');
  const playSwing = useSoundEffect('https://zboparcletaettrhjzyw.supabase.co/storage/v1/object/public/public-assets/slow-swing.mp3');

  const { isMuted, toggleMute } = useGameMusic(room?.status);

  const isHost = room?.host_id === userId;

  const fetchLobbyData = useCallback(async () => {
    try {
      if (!room) setIsLoading(true);

      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCode)
        .single();

      if (roomError || !roomData) {
        throw new Error('Лобби не найдено');
      }

      setRoom(roomData);

      if (roomData.users_ids && roomData.users_ids.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('players')
          .select('id, nickname')
          .in('id', roomData.users_ids);

        if (usersError) throw usersError;
        setPlayers((usersData || []).map(p => ({
          ...p,
          role: p.id.startsWith('bot_') ? 'Bot' : 'Player'
        })));
      }

      setIsLoading(false);
    } catch (err: any) {
      console.error('Error fetching lobby data:', err);
      setError(err.message || 'Не удалось загрузить лобби');
      setIsLoading(false);
    }
  }, [roomCode, room]);

  useEffect(() => {
    const storedUserId = localStorage.getItem('user_id');
    if (!storedUserId) {
      router.push('/');
      return;
    }
    setUserId(storedUserId);

    fetchLobbyData();

    const channel = supabase
      .channel(`room_${roomCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `room_code=eq.${roomCode}`
        },
        () => {
          fetchLobbyData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, router]);

  // Reset states when returning to lobby
  useEffect(() => {
    if (room?.status === 'Waiting') {
      setHasAnswered(false);
      setAnswerText('');
      setSubmittedAnswersCount(0);
      setHasVoted(false);
      setSubmittedVotesCount(0);
      setVotingOptions([]);
      setCurrentQuestion(null);
      setRoundResults([]);
      botsVotedRef.current = false;
      setRoundWinners({});
    }
  }, [room?.status]);

  // Reset per-round states on any transition of status, round, or question
  useEffect(() => {
    setHasAnswered(false);
    setAnswerText('');
    setIsSubmittingAnswer(false);
    setHasVoted(false);
    setIsSubmittingVote(false);
    setVotingOptions([]);
    setSubmittedAnswersCount(0);
    setSubmittedVotesCount(0);
    setRoundResults([]);
    botsVotedRef.current = false;
    setTimeLeft(60);
    setSelectedVoteId(null);
    setIsAnswerSubmittedClicked(false);
  }, [room?.status, room?.current_round, room?.current_question_id]);

  const triggerHaptics = () => {
    if (typeof window !== 'undefined' && window.navigator && typeof window.navigator.vibrate === 'function') {
      try {
        window.navigator.vibrate(50);
      } catch (e) {
        console.warn("Haptic feedback error:", e);
      }
    }
  };

  // Timer decrement effect
  useEffect(() => {
    if (room?.status !== 'Round 1' && room?.status !== 'Voting') return;
    
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        
        const nextTime = prev - 1;
        
        // Play synthetic ticking sound under 10 seconds if not finished yet
        if (nextTime <= 10) {
          const isFinished = room?.status === 'Round 1' ? hasAnswered : hasVoted;
          if (!isFinished) {
            try {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const osc = audioCtx.createOscillator();
              const gainNode = audioCtx.createGain();
              osc.connect(gainNode);
              gainNode.connect(audioCtx.destination);
              osc.frequency.setValueAtTime(800, audioCtx.currentTime);
              gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
              osc.start();
              osc.stop(audioCtx.currentTime + 0.08);
            } catch (e) {
              console.warn("Ticking sound blocked or failed:", e);
            }
          }
        }
        
        return nextTime;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [room?.status, room?.current_round, room?.current_question_id, hasAnswered, hasVoted]);

  // Timer auto-submit and Host-driven fallback transition effect
  useEffect(() => {
    if (timeLeft === 0) {
      if (room?.status === 'Round 1' && !hasAnswered) {
        const submitRandomAnswer = async () => {
          let randomAnswerText = "";
          if (currentQuestion?.fake_answers && currentQuestion.fake_answers.length > 0) {
            const index = Math.floor(Math.random() * currentQuestion.fake_answers.length);
            randomAnswerText = currentQuestion.fake_answers[index];
          } else {
            randomAnswerText = "Моё время истекло, но мой дух силён! ⚡";
          }
          
          setIsSubmittingAnswer(true);
          try {
            const { error } = await supabase
              .from('answers')
              .insert([{
                question_id: currentQuestion?.id || room?.current_question_id,
                user_id: userId,
                room_code: roomCode,
                answer_text: randomAnswerText
              }]);
            if (error) throw error;
            setHasAnswered(true);
          } catch (err) {
            console.error('Error auto-submitting answer:', err);
          } finally {
            setIsSubmittingAnswer(false);
          }
        };
        submitRandomAnswer();
      } else if (room?.status === 'Voting' && !hasVoted) {
        const submitRandomVote = async () => {
          if (votingOptions.length === 0) return;
          
          const validOptions = votingOptions.filter(opt => opt.user_id !== userId);
          const chosenAnswer = validOptions.length > 0 
            ? validOptions[Math.floor(Math.random() * validOptions.length)]
            : votingOptions[0];
            
          if (!chosenAnswer) return;
          
          setIsSubmittingVote(true);
          try {
            const { error } = await supabase
              .from('votes')
              .insert([{
                answer_id: chosenAnswer.id,
                user_id: userId,
                room_code: roomCode
              }]);
            if (error) throw error;
            setHasVoted(true);
          } catch (err) {
            console.error('Error auto-submitting vote:', err);
          } finally {
            setIsSubmittingVote(false);
          }
        };
        submitRandomVote();
      }
      
      if (isHost) {
        const transitionOnTimeout = async () => {
          try {
            if (room?.status === 'Round 1') {
              setTimeout(async () => {
                const { data: latestRoom } = await supabase.from('rooms').select('status').eq('room_code', roomCode).single();
                if (latestRoom?.status === 'Round 1') {
                  console.log("Host forcing transition to Voting phase on timeout");
                  await supabase.from('rooms').update({ status: 'Voting' }).eq('room_code', roomCode);
                }
              }, 1500);
            } else if (room?.status === 'Voting') {
              setTimeout(async () => {
                const { data: latestRoom } = await supabase.from('rooms').select('status').eq('room_code', roomCode).single();
                if (latestRoom?.status === 'Voting') {
                  console.log("Host forcing transition to Round Results phase on timeout");
                  await supabase.from('rooms').update({ status: 'Round Results' }).eq('room_code', roomCode);
                }
              }, 1500);
            }
          } catch (err) {
            console.error('Host transition on timeout error:', err);
          }
        };
        transitionOnTimeout();
      }
    }
  }, [timeLeft, room?.status, hasAnswered, hasVoted, currentQuestion, votingOptions, isHost, roomCode, userId]);

  // --- AUTO-TRANSITION TO ROUND 1 & BOT ANSWERS (HOST ONLY) ---
  useEffect(() => {
    if (room?.status === 'Starting' && isHost) {
      const timer = setTimeout(async () => {
        try {
          const { data: questionsData, error: qError } = await supabase
            .from('questions')
            .select('id, fake_answers');
            
          if (qError) throw qError;
          
          let selectedQuestion: QuestionData | null = null;
          if (questionsData && questionsData.length > 0) {
            const randomIndex = Math.floor(Math.random() * questionsData.length);
            selectedQuestion = questionsData[randomIndex] as QuestionData;
            playedQuestionsRef.current = [selectedQuestion.id];
          }
          
          if (!selectedQuestion) return;

          const { error: updateError } = await supabase
            .from('rooms')
            .update({ 
              status: 'Round 1', 
              current_question_id: selectedQuestion.id,
              current_round: 1
            })
            .eq('room_code', roomCode);
            
          if (updateError) {
             console.error('Error updating to Round 1:', updateError);
          }

          const { data: roomCheck } = await supabase.from('rooms').select('users_ids').eq('room_code', roomCode).single();
          if (roomCheck?.users_ids) {
            const { data: currentPlayers } = await supabase.from('players').select('id, nickname').in('id', roomCheck.users_ids);
            const bots = currentPlayers?.filter(p => p.id.startsWith('bot_')) || [];
            
            if (bots.length > 0) {
              const fakes = selectedQuestion?.fake_answers || [];
              const shuffledFakes = [...fakes].sort(() => Math.random() - 0.5);

              const botAnswers = bots.map(bot => {
                let randomAnswer = "";
                if (shuffledFakes.length > 0) {
                  randomAnswer = shuffledFakes.pop()!;
                } else {
                  randomAnswer = `${bot.nickname} многозначительно молчит...`;
                }
                
                return {
                  question_id: selectedQuestion!.id,
                  user_id: bot.id,
                  room_code: roomCode,
                  answer_text: randomAnswer
                };
              });

              const { error: botAnsError } = await supabase.from('answers').insert(botAnswers);
              if (botAnsError) console.error('Error submitting bot answers:', botAnsError);
            }
          }
        } catch (err) {
          console.error('Auto-transition error:', err);
        }
      }, 3500);
      
      return () => clearTimeout(timer);
    }
  }, [room?.status, isHost, roomCode]);

  // --- FETCH CURRENT QUESTION (ALL PLAYERS) ---
  useEffect(() => {
    const fetchQuestion = async () => {
      if ((room?.status === 'Round 1' || room?.status === 'Voting' || room?.status === 'Round Results') && room?.current_question_id) {
        if (currentQuestion?.id === room.current_question_id) return;
        try {
          const { data, error } = await supabase
            .from('questions')
            .select('id, question_text, fake_answers')
            .eq('id', room.current_question_id)
            .single();
            
          if (error) throw error;
          setCurrentQuestion(data);
        } catch (err) {
          console.error('Error fetching question:', err);
        }
      }
    };
    
    fetchQuestion();
  }, [room?.status, room?.current_question_id, currentQuestion?.id]);

  // --- TRACK SUBMITTED ANSWERS (ALL PLAYERS) ---
  useEffect(() => {
    if (room?.status === 'Round 1' && room?.current_question_id) {
      const fetchInitialCount = async () => {
        const { count, error } = await supabase
          .from('answers')
          .select('*', { count: 'exact', head: true })
          .eq('room_code', roomCode)
          .eq('question_id', room.current_question_id!);
          
        if (!error && count !== null) {
          setSubmittedAnswersCount(count);
        }
      };
      
      fetchInitialCount();

      const answersChannel = supabase
        .channel(`answers_${roomCode}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'answers',
            filter: `room_code=eq.${roomCode}`
          },
          (payload: any) => {
            if (payload.new && payload.new.question_id === room?.current_question_id) {
              setSubmittedAnswersCount(prev => prev + 1);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(answersChannel);
      };
    }
  }, [room?.status, roomCode, room?.current_question_id]);

  // --- AUTO-TRANSITION TO VOTING (HOST ONLY) ---
  useEffect(() => {
    if (
      isHost && 
      room?.status === 'Round 1' && 
      players.length > 0 && 
      submittedAnswersCount >= players.length
    ) {
      const timer = setTimeout(async () => {
        try {
          // Double-check: Query the database to ensure we have answers for the current room.current_question_id
          const { data: currentAnswers, error: checkError } = await supabase
            .from('answers')
            .select('id')
            .eq('room_code', roomCode)
            .eq('question_id', room.current_question_id!);
            
          if (checkError) {
            console.error('Error double-checking answers:', checkError);
            return;
          }
          
          if (!currentAnswers || currentAnswers.length < players.length) {
            console.log(`Transition aborted: Only ${currentAnswers?.length || 0}/${players.length} answers in DB for question ${room.current_question_id}`);
            return;
          }

          const { error } = await supabase
            .from('rooms')
            .update({ status: 'Voting' })
            .eq('room_code', roomCode);
            
          if (error) console.error('Error transitioning to Voting:', error);
        } catch (err) {
          console.error('Error in Voting transition:', err);
        }
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isHost, room?.status, players.length, submittedAnswersCount, roomCode, room?.current_question_id]);

  // --- VOTING SETUP & FETCH OPTIONS (ALL PLAYERS) ---
  useEffect(() => {
    if (room?.status === 'Voting' && room?.current_question_id) {
      let isMounted = true;
      
      const setupVoting = async () => {
        const { data: answersData, error } = await supabase
          .from('answers')
          .select('id, user_id, answer_text')
          .eq('room_code', roomCode)
          .eq('question_id', room.current_question_id!);
          
        if (!error && answersData && isMounted) {
          const shuffled = [...answersData].sort(() => Math.random() - 0.5);
          setVotingOptions(shuffled);
        }

        const { count } = await supabase
          .from('votes')
          .select('*', { count: 'exact', head: true })
          .eq('room_code', roomCode);
          
        if (count !== null && isMounted) {
          setSubmittedVotesCount(count);
        }
      };

      setupVoting();

      const votesChannel = supabase
        .channel(`votes_${roomCode}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'votes',
            filter: `room_code=eq.${roomCode}`
          },
          () => {
            if (isMounted) setSubmittedVotesCount(prev => prev + 1);
          }
        )
        .subscribe();

      return () => {
        isMounted = false;
        supabase.removeChannel(votesChannel);
      };
    }
  }, [room?.status, roomCode, room?.current_question_id]);

  // --- AUTO-VOTE FOR BOTS (HOST ONLY) ---
  useEffect(() => {
    if (isHost && room?.status === 'Voting' && votingOptions.length > 0 && !botsVotedRef.current) {
      botsVotedRef.current = true;
      
      const submitBotVotes = async () => {
        const bots = players.filter(p => p.role === 'Bot');
        if (bots.length === 0) return;

        const botVotesToInsert = bots.map(bot => {
          const validOptions = votingOptions.filter(opt => opt.user_id !== bot.id);
          const chosenAnswer = validOptions.length > 0 
            ? validOptions[Math.floor(Math.random() * validOptions.length)]
            : votingOptions[0];

          return {
            answer_id: chosenAnswer.id,
            user_id: bot.id,
            room_code: roomCode
          };
        });

        setTimeout(async () => {
          const { error } = await supabase.from('votes').insert(botVotesToInsert);
          if (error) console.error('Error submitting bot votes:', error);
        }, 1500);
      };
      
      submitBotVotes();
    }
  }, [isHost, room?.status, votingOptions, roomCode, players]);

  // --- AUTO-TRANSITION TO RESULTS (HOST ONLY) ---
  useEffect(() => {
    if (
      isHost && 
      room?.status === 'Voting' && 
      players.length > 0 && 
      submittedVotesCount >= players.length
    ) {
      const timer = setTimeout(async () => {
        try {
          // Double check: Query the database to ensure we have votes for the current room
          const { data: currentVotes, error: checkError } = await supabase
            .from('votes')
            .select('id')
            .eq('room_code', roomCode);
            
          if (checkError) {
            console.error('Error double-checking votes:', checkError);
            return;
          }
          
          if (!currentVotes || currentVotes.length < players.length) {
            console.log(`Transition to results aborted: Only ${currentVotes?.length || 0}/${players.length} votes in DB`);
            return;
          }

          await supabase
            .from('rooms')
            .update({ status: 'Round Results' })
            .eq('room_code', roomCode);
        } catch (err) {
          console.error('Error in Results transition:', err);
        }
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isHost, room?.status, players.length, submittedVotesCount, roomCode]);

  // --- CALCULATE ROUND RESULTS (ALL PLAYERS) ---
  useEffect(() => {
    if (room?.status === 'Round Results' && room?.current_question_id) {
      let isMounted = true;
      
      const calculateResults = async () => {
        try {
          const { data: answers, error: ansError } = await supabase
            .from('answers')
            .select('*')
            .eq('room_code', roomCode)
            .eq('question_id', room.current_question_id!);
            
          if (ansError) throw ansError;

          let votesData: any[] = [];
          let attempts = 0;
          const maxAttempts = 15;
          const expectedVotesCount = players.length;

          while (attempts < maxAttempts) {
            const { data: votes, error: votesError } = await supabase
              .from('votes')
              .select('*')
              .eq('room_code', roomCode);

            if (votesError) throw votesError;

            votesData = votes || [];

            // If we have fetched at least the expected number of votes, we can proceed
            if (votesData.length >= expectedVotesCount) {
              console.log(`Successfully fetched complete votes (${votesData.length}/${expectedVotesCount}) on attempt ${attempts + 1}`);
              break;
            }

            console.log(`Incomplete votes fetched (${votesData.length}/${expectedVotesCount}). Retrying in 300ms...`);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          if (!isMounted) return;

          if (answers && votesData) {
            const tallies: Record<string, number> = {};
            votesData.forEach(v => {
              tallies[v.answer_id] = (tallies[v.answer_id] || 0) + 1;
            });
            
            const resultsArray: VoteResult[] = answers.map(ans => {
              const author = players.find(p => p.id === ans.user_id);
              return {
                answer_id: ans.id,
                answer_text: ans.answer_text,
                author_id: ans.user_id,
                author_nickname: author?.nickname || 'Неизвестный',
                author_role: author?.role || 'Player',
                votes: tallies[ans.id] || 0
              };
            });
            
            resultsArray.sort((a, b) => b.votes - a.votes);
            
            setRoundResults(resultsArray);
            
            const currentRound = room?.current_round || 1;
            if (resultsArray.length > 0 && !scoredRoundsRef.current.has(currentRound)) {
              scoredRoundsRef.current.add(currentRound);
              const highestVotes = resultsArray[0].votes;
              if (highestVotes > 0) {
                const winners = resultsArray.filter(r => r.votes === highestVotes);
                const pointsEarned = 100 * currentRound;
                
                setSessionScores(prev => {
                  const newScores = { ...prev };
                  winners.forEach(w => {
                    newScores[w.author_id] = (newScores[w.author_id] || 0) + pointsEarned;
                  });
                  return newScores;
                });
                
                setRoundWinners(prev => ({
                  ...prev,
                  [currentRound]: winners.map(w => w.author_nickname).join(', ')
                }));
              } else {
                setRoundWinners(prev => ({
                  ...prev,
                  [currentRound]: "Никто"
                }));
              }
            }
          }
        } catch (err) {
          console.error('Error calculating results:', err);
        }
      };
      
      calculateResults();
      
      return () => { isMounted = false; };
    }
  }, [room?.status, roomCode, room?.current_question_id, players]);

  // --- AUTO-TRANSITION TO NEXT ROUND / LEADERBOARD (HOST ONLY) ---
  const startNextRound = async () => {
    if (!isHost) return;
    
    // Force Local State Clearing on Transitions immediately
    setHasAnswered(false);
    setAnswerText('');
    setIsSubmittingAnswer(false);
    setHasVoted(false);
    setIsSubmittingVote(false);
    setVotingOptions([]);
    setSubmittedAnswersCount(0);
    setSubmittedVotesCount(0);
    setRoundResults([]);
    botsVotedRef.current = false;
    setTimeLeft(60);
    setSelectedVoteId(null);
    setIsAnswerSubmittedClicked(false);

    try {
      const currentRound = room?.current_round || 1;
      if (currentRound < 3) {
        const { data: questionsData, error: qError } = await supabase
          .from('questions')
          .select('id, fake_answers');
          
        if (qError) throw qError;
        
        let selectedQuestion: QuestionData | null = null;
        if (questionsData && questionsData.length > 0) {
          const availableQuestions = questionsData.filter(q => !playedQuestionsRef.current.includes(q.id));
          const pool = availableQuestions.length > 0 ? availableQuestions : questionsData;
          const randomIndex = Math.floor(Math.random() * pool.length);
          selectedQuestion = pool[randomIndex] as QuestionData;
          playedQuestionsRef.current.push(selectedQuestion.id);
        }
        
        if (selectedQuestion) {
          await supabase.from('votes').delete().eq('room_code', roomCode);
          await supabase.from('answers').delete().eq('room_code', roomCode);
          
          await supabase
            .from('rooms')
            .update({ 
              status: 'Round 1', 
              current_question_id: selectedQuestion.id,
              current_round: currentRound + 1
            })
            .eq('room_code', roomCode);
            
          const { data: roomCheck } = await supabase.from('rooms').select('users_ids').eq('room_code', roomCode).single();
          if (roomCheck?.users_ids) {
            const { data: currentPlayers } = await supabase.from('players').select('id, nickname').in('id', roomCheck.users_ids);
            const bots = currentPlayers?.filter(p => p.id.startsWith('bot_')) || [];
            
            if (bots.length > 0) {
              const fakes = selectedQuestion!.fake_answers || [];
              const shuffledFakes = [...fakes].sort(() => Math.random() - 0.5);

              const botAnswers = bots.map(bot => {
                let randomAnswer = "";
                if (shuffledFakes.length > 0) {
                  randomAnswer = shuffledFakes.pop()!;
                } else {
                  randomAnswer = `${bot.nickname} многозначительно молчит...`;
                }
                
                return {
                  question_id: selectedQuestion!.id,
                  user_id: bot.id,
                  room_code: roomCode,
                  answer_text: randomAnswer
                };
              });
              await supabase.from('answers').insert(botAnswers);
            }
          }
        }
      } else {
        await supabase
          .from('rooms')
          .update({ status: 'Leaderboard' })
          .eq('room_code', roomCode);
      }
    } catch (err) {
      console.error('Error in transition:', err);
    }
  };

  // --- SAVE GAME RESULTS (HOST ONLY) ---
  useEffect(() => {
    if (isHost && room?.status === 'Leaderboard' && !hasSavedResultsRef.current) {
      hasSavedResultsRef.current = true;
      const saveGameResults = async () => {
        try {
          for (const player of players) {
            const earned = sessionScores[player.id] || 0;
            
            const { data: profile } = await supabase
              .from('players')
              .select('*')
              .eq('id', player.id)
              .single();
              
            if (profile) {
              await supabase
                .from('players')
                .update({ 
                  total_score: (profile.total_score || 0) + earned,
                  games_played: (profile.games_played || 0) + 1
                })
                .eq('id', player.id);
            } else {
              await supabase
                .from('players')
                .insert([{
                  id: player.id,
                  nickname: player.nickname,
                  total_score: earned,
                  games_played: 1
                }]);
            }
            
            await supabase
              .from('game_history')
              .insert([{
                room_code: roomCode,
                player_id: player.id,
                score_earned: earned
              }]);
          }
        } catch (err) {
          console.error('Error saving game results:', err);
        }
      };
      
      saveGameResults();
    }
  }, [isHost, room?.status, players, sessionScores, roomCode]);


  const handleCopyLink = () => {
    const isTelegram = typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initData;
    const link = isTelegram 
      ? `https://t.me/JXOVO_bot/jxovo?startapp=${roomCode}`
      : `https://${window.location.host}/?room=${roomCode}`;
      
    copyToClipboard(link);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy link:', err);
    });
  };

  const handleShareInvite = async () => {
    const inviteUrl = qrSource === 'web' 
      ? `https://jxovo.fun/room/${roomCode}` 
      : `https://t.me/JXOVO_bot/jxovo?startapp=${roomCode}`;
      
    const shareText = `🚀 Присоединяйтесь к игре JXOVO! Мы в комнате ${roomCode}. Заходите поиграть: ${inviteUrl}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Присоединяйтесь к JXOVO!',
          text: shareText,
          url: inviteUrl
        });
      } catch (err) {
        console.warn('Native share failed, falling back to clipboard copy:', err);
        copyToClipboard(inviteUrl);
      }
    } else {
      copyToClipboard(inviteUrl);
    }
  };

  const handleCopyQR = async () => {
    try {
      const svg = document.getElementById('qr-code-svg');
      if (!svg) throw new Error('QR SVG not found');
      
      const svgString = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);
      
      const image = new Image();
      image.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = svg.clientWidth || 130;
        canvas.height = svg.clientHeight || 130;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#FFFFFF';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          
          canvas.toBlob(async (blob) => {
            if (blob) {
              try {
                await navigator.clipboard.write([
                  new ClipboardItem({ 'image/png': blob })
                ]);
                setQrCopied(true);
                setTimeout(() => setQrCopied(false), 2000);
              } catch (err) {
                console.error('Clipboard write failed:', err);
              }
            }
          }, 'image/png');
        }
      };
      image.src = blobURL;
    } catch (err) {
      console.error('Error copying QR:', err);
    }
  };



  const renderMuteButton = () => {
    return (
      <button
        onClick={toggleMute}
        className="fixed top-4 right-4 z-50 p-3 bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-800 rounded-full transition-all text-neutral-300 hover:text-white shadow-lg cursor-pointer"
        title={isMuted ? "Включить музыку" : "Выключить музыку"}
      >
        {isMuted ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 animate-[pulse_2s_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.75 9.5H4.5v5h3.25L12 18.75z" />
          </svg>
        )}
      </button>
    );
  };

  const handleAddBot = async () => {
    if (!room) return;
    setIsAddingBot(true);
    
    try {
      let botNickname = "";
      const trimmedCustomName = customBotName.trim();
      
      if (trimmedCustomName) {
        botNickname = trimmedCustomName;
      } else {
        try {
          const { data, error } = await supabase
            .from('bot_names')
            .select('name');
            
          if (error || !data || data.length === 0) {
            botNickname = `Бот ${Math.floor(Math.random() * 1000)}`;
          } else {
            const randomIndex = Math.floor(Math.random() * data.length);
            botNickname = data[randomIndex].name;
          }
        } catch (fetchErr) {
          console.error('Failed to fetch from bot_names, falling back:', fetchErr);
          botNickname = `Бот ${Math.floor(Math.random() * 1000)}`;
        }
      }

      const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      const { data: botData, error: botError } = await supabase
        .from('players')
        .insert([{ id: botId, nickname: botNickname, total_score: 0, games_played: 0 }])
        .select()
        .single();
        
      if (botError) throw botError;
      
      const newUsersIds = [...room.users_ids, botId];
      
      const { error: updateError } = await supabase
        .from('rooms')
        .update({ users_ids: newUsersIds, users_num: newUsersIds.length })
        .eq('room_code', roomCode);
        
      if (updateError) throw updateError;
      
      setCustomBotName("");
      await fetchLobbyData();
    } catch (err) {
      console.error('Error adding bot:', err);
    } finally {
      setIsAddingBot(false);
    }
  };

  const handleStartGame = async () => {
    if (players.length < 2) {
      alert("Вам нужно пригласить минимум одного игрока.");
      return;
    }
    
    // Force Local State Clearing on Transitions immediately
    setHasAnswered(false);
    setAnswerText('');
    setIsSubmittingAnswer(false);
    setHasVoted(false);
    setIsSubmittingVote(false);
    setVotingOptions([]);
    setSubmittedAnswersCount(0);
    setSubmittedVotesCount(0);
    setRoundResults([]);
    botsVotedRef.current = false;

    try {
      const { error: updateError } = await supabase
        .from('rooms')
        .update({ status: 'Starting' })
        .eq('room_code', roomCode);

      if (updateError) {
        console.error('Supabase error starting game:', updateError);
        alert(`Ошибка при запуске игры: ${updateError.message}`);
        return;
      }
    } catch (err: any) {
      console.error('Error starting game:', err);
      alert('Ошибка при запуске игры.');
    }
  };

  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerText.trim() || !currentQuestion || !userId) return;
    
    triggerHaptics();
    setIsAnswerSubmittedClicked(true);
    setIsSubmittingAnswer(true);
    
    try {
      const { error } = await supabase
        .from('answers')
        .insert([{
          question_id: currentQuestion.id,
          user_id: userId,
          room_code: roomCode,
          answer_text: answerText.trim()
        }]);
        
      if (error) throw error;
      
      playWhoosh();
      setHasAnswered(true);
    } catch (err) {
      console.error('Error submitting answer:', err);
      alert('Ошибка при отправке ответа');
      setIsAnswerSubmittedClicked(false);
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleVoteSubmit = async (answerId: string) => {
    if (!userId || isSubmittingVote) return;
    triggerHaptics();
    setSelectedVoteId(answerId);
    setIsSubmittingVote(true);
    
    try {
      const { error } = await supabase
        .from('votes')
        .insert([{
          answer_id: answerId,
          user_id: userId,
          room_code: roomCode
        }]);
        
      if (error) throw error;
      playSwing();
      setHasVoted(true);
    } catch (err) {
      console.error('Error submitting vote:', err);
      alert('Ошибка при отправке голоса');
      setSelectedVoteId(null);
      setIsSubmittingVote(false);
    }
  };

  const handleReturnToLobby = async () => {
    if (!isHost) return;
    
    // Force Local State Clearing on Transitions immediately
    setHasAnswered(false);
    setAnswerText('');
    setIsSubmittingAnswer(false);
    setHasVoted(false);
    setIsSubmittingVote(false);
    setVotingOptions([]);
    setSubmittedAnswersCount(0);
    setSubmittedVotesCount(0);
    setRoundResults([]);
    botsVotedRef.current = false;
    setTimeLeft(60);
    setSelectedVoteId(null);
    setIsAnswerSubmittedClicked(false);

    try {
      // 1. Delete votes and answers for cleanup
      await supabase.from('votes').delete().eq('room_code', roomCode);
      await supabase.from('answers').delete().eq('room_code', roomCode);
      
      // 2. Reset room status back to waiting
      await supabase.from('rooms').update({
        status: 'Waiting',
        current_question_id: null,
        current_round: null
      }).eq('room_code', roomCode);
      
      hasSavedResultsRef.current = false;
      setSessionScores({});
      setRoundWinners({});
      scoredRoundsRef.current.clear();
      playedQuestionsRef.current = [];
      
    } catch (err) {
      console.error('Error returning to lobby:', err);
    }
  };

  const getLocalizedStatus = (status: string | undefined) => {
    if (status === 'Waiting') return 'ОЖИДАНИЕ';
    if (status === 'Starting') return 'ЗАПУСК...';
    if (status === 'Round 1') return `РАУНД ${room?.current_round || 1}`;
    if (status === 'Voting') return 'ГОЛОСОВАНИЕ';
    if (status === 'Round Results') return 'ИТОГИ РАУНДА';
    if (status === 'Leaderboard') return 'ИГРА ОКОНЧЕНА';
    return status || 'ОЖИДАНИЕ';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-neutral-400 flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p>Загрузка лобби...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 font-sans text-neutral-50">
        <div className="bg-neutral-900/80 p-8 rounded-2xl border border-red-900/50 text-center space-y-6 max-w-sm shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto text-red-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="text-red-400 font-medium text-lg">{error}</div>
          <button 
            onClick={() => router.push('/')}
            className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl transition-colors font-semibold"
          >
            На главную
          </button>
        </div>
      </div>
    );
  }

  // --- LEADERBOARD / GAME OVER WIDGET ---
  if (room?.status === 'Leaderboard') {
    const sortedPlayers = [...players].sort((a, b) => (sessionScores[b.id] || 0) - (sessionScores[a.id] || 0));
    const overallWinner = sortedPlayers.length > 0 ? sortedPlayers[0] : null;

    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center justify-center p-4 md:p-8 font-sans selection:bg-indigo-500/30">
        <main className="w-full max-w-2xl text-center space-y-12 animate-in fade-in zoom-in-95 duration-700">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 drop-shadow-[0_0_25px_rgba(167,139,250,0.4)]">
              ИГРА ОКОНЧЕНА
            </h1>
            <p className="text-neutral-400 text-lg md:text-xl font-medium">Спасибо за игру!</p>
          </div>

          <div className="bg-neutral-900/60 p-8 rounded-3xl border border-neutral-800/80 shadow-2xl backdrop-blur-md">
            {overallWinner && (
              <div className="mb-8">
                <div className="w-24 h-24 mx-auto mb-4 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/30">
                  <span className="text-5xl">👑</span>
                </div>
                <h2 className="text-3xl font-extrabold text-amber-400">{overallWinner.nickname}</h2>
                <p className="text-neutral-400 mt-2 font-medium">Абсолютный чемпион ({sessionScores[overallWinner.id] || 0} очков)</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {[1, 2, 3].map(roundNum => (
                <div key={roundNum} className="bg-neutral-950/40 border border-neutral-800/50 p-4 rounded-2xl text-center">
                  <div className="text-xs text-neutral-500 uppercase tracking-wider mb-2 font-bold">Раунд {roundNum}</div>
                  <div className="text-indigo-400 font-semibold truncate text-lg">
                    {roundWinners[roundNum] || "Никто"}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 mt-8">
              <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest text-center mb-4">Таблица лидеров</h3>
              {sortedPlayers.map((p, idx) => (
                <div key={p.id} className="bg-neutral-950/50 border border-neutral-800/60 p-4 rounded-2xl flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className={`font-bold w-6 text-center ${idx === 0 ? 'text-amber-500' : 'text-neutral-500'}`}>#{idx + 1}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-lg">{p.nickname}</span>
                      {p.id === userId && <span className="text-[10px] font-bold bg-indigo-500 text-white px-2 py-0.5 rounded-md uppercase">ВЫ</span>}
                      {p.role === 'Bot' && <span className="text-[10px] font-bold bg-neutral-600 text-neutral-200 px-2 py-0.5 rounded-md uppercase">БОТ</span>}
                    </div>
                  </div>
                  <div className="bg-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-lg border border-indigo-500/20 font-bold">
                    {sessionScores[p.id] || 0}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isHost ? (
            <div className="pt-8 w-full flex flex-col items-center gap-4">
              <button 
                onClick={handleReturnToLobby}
                className="w-full md:w-auto md:min-w-[300px] px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-[0_0_40px_rgba(16,185,129,0.2)] hover:shadow-[0_0_60px_rgba(16,185,129,0.3)] transition-all active:scale-[0.98] text-lg"
              >
                Сыграть ещё раз тем же составом
              </button>
              <button 
                onClick={() => router.push('/')}
                className="w-full md:w-auto md:min-w-[300px] px-8 py-4 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold rounded-2xl transition-all active:scale-[0.98] text-lg shadow-xl"
              >
                Создать новую комнату
              </button>
            </div>
          ) : (
            <div className="pt-8 w-full flex flex-col items-center gap-4">
              <p className="text-neutral-500 animate-pulse font-medium mb-2">Ожидание решения хоста...</p>
              <button 
                onClick={() => router.push('/')}
                className="w-full md:w-auto md:min-w-[300px] px-8 py-4 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold rounded-2xl transition-all active:scale-[0.98] text-lg shadow-xl"
              >
                Создать новую комнату
              </button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // --- ROUND RESULTS WIDGET ---
  if (room?.status === 'Round Results') {
    const winner = roundResults.length > 0 ? roundResults[0] : null;
    const runnersUp = roundResults.length > 1 ? roundResults.slice(1) : [];

    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center justify-center p-4 md:p-8 font-sans selection:bg-indigo-500/30">
        <main className="w-full max-w-3xl space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <header className="text-center space-y-4">
            <div className="inline-block px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400 text-sm font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              Итоги Раунда
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-300 drop-shadow-sm">
              {currentQuestion?.question_text}
            </h1>
          </header>

          {winner ? (
            <div className="space-y-8">
              {/* Winner Card */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 rounded-[2rem] blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                <div className="bg-neutral-900 border border-amber-500/30 p-8 md:p-12 rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col items-center text-center">
                  <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-48 w-48 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                    </svg>
                  </div>
                  
                  <div className="text-amber-400 font-black tracking-widest uppercase text-sm mb-6 flex items-center gap-2">
                    <span className="text-xl">🏆</span> ПОБЕДИТЕЛЬ РАУНДА
                  </div>
                  
                  <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-8 leading-tight">
                    &quot;{winner.answer_text}&quot;
                  </h2>
                  
                  <div className="flex items-center gap-4 bg-black/40 px-6 py-3 rounded-2xl border border-white/5">
                    <div className="h-10 w-10 bg-amber-500/20 text-amber-500 flex items-center justify-center rounded-full font-bold text-lg">
                      {winner.author_nickname.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-neutral-200 flex items-center gap-2">
                        {winner.author_nickname}
                        {winner.author_id === userId && (
                          <span className="text-[10px] font-bold bg-indigo-500 text-white px-2 py-0.5 rounded-md uppercase tracking-wider">ВЫ</span>
                        )}
                        {winner.author_role === 'Bot' && (
                          <span className="text-[10px] font-bold bg-neutral-600 text-neutral-200 px-2 py-0.5 rounded-md uppercase tracking-wider">БОТ</span>
                        )}
                      </div>
                      <div className="text-amber-500/80 text-sm font-medium">Голосов: {winner.votes}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Runners up */}
              {runnersUp.length > 0 && (
                <div className="space-y-4 pt-4">
                  <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-widest text-center mb-4">Остальные ответы</h3>
                  <div className="grid gap-3">
                    {runnersUp.map((ans, idx) => (
                      <div key={ans.answer_id} className="bg-neutral-900/40 border border-neutral-800/60 p-4 rounded-2xl flex justify-between items-center backdrop-blur-sm">
                        <div className="flex items-center gap-4">
                          <div className="text-neutral-500 font-bold w-6 text-center">#{idx + 2}</div>
                          <div>
                            <div className="text-white font-medium text-lg">{ans.answer_text}</div>
                            <div className="text-neutral-500 text-sm flex items-center gap-2">
                              {ans.author_nickname}
                              {ans.author_role === 'Bot' && <span className="text-[9px] bg-neutral-700 text-neutral-300 px-1.5 py-0.5 rounded">БОТ</span>}
                            </div>
                          </div>
                        </div>
                        <div className="bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800">
                          <span className="text-neutral-400 font-medium">{ans.votes} {ans.votes === 1 ? 'голос' : 'голосов'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
             <div className="flex justify-center p-8 text-neutral-500 animate-pulse">Подсчет результатов...</div>
          )}
          
          <div className="pt-8 flex flex-col items-center">
            {isHost ? (
              <button 
                onClick={startNextRound}
                className="w-full md:w-auto md:min-w-[300px] px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-[0_0_40px_rgba(16,185,129,0.2)] hover:shadow-[0_0_60px_rgba(16,185,129,0.3)] transition-all active:scale-[0.98] text-lg"
              >
                {room?.current_round === 3 ? "Перейти к итогам игры" : "Перейти к следующему раунду"}
              </button>
            ) : (
              <p className="text-neutral-500 animate-pulse text-lg font-medium">Хост переводит игру в следующий раунд...</p>
            )}
          </div>
        </main>
      </div>
    );
  }

  // --- VOTING WIDGET ---
  if (room?.status === 'Voting') {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center justify-center p-4 md:p-8 font-sans selection:bg-indigo-500/30">
        <main className="w-full max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <header className="text-center space-y-6">
            <div className="inline-block px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-sm font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(99,102,241,0.1)]">
              Голосование
            </div>
            
            <div className="min-h-[80px] flex items-center justify-center">
              <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-white drop-shadow-sm">
                {currentQuestion?.question_text || "Загрузка вопроса..."}
              </h1>
            </div>
            <p className="text-neutral-400 font-medium">Выберите самый смешной или точный ответ!</p>
          </header>

          <div className="bg-neutral-900/60 p-6 md:p-10 rounded-3xl border border-neutral-800/80 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
            
            {/* Countdown Timer Widget */}
            <div className="w-full space-y-2 mb-8 relative z-10">
              <div className="flex justify-between items-center text-sm font-semibold tracking-wider text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${timeLeft <= 10 ? 'bg-rose-500 animate-ping' : 'bg-indigo-500 animate-pulse'}`}></span>
                  {timeLeft <= 10 ? 'ВРЕМЯ НА ИСХОДЕ!' : 'ОСТАЛОСЬ ВРЕМЕНИ:'}
                </span>
                <span className={`font-mono text-lg font-black ${timeLeft <= 10 ? 'text-rose-500 scale-110' : 'text-indigo-400'} transition-all duration-300`}>
                  {timeLeft} сек
                </span>
              </div>
              <div className="h-3 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 p-0.5">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${
                    timeLeft <= 10 
                      ? 'bg-gradient-to-r from-red-500 to-rose-600 animate-[pulse_1s_infinite]' 
                      : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'
                  }`}
                  style={{ width: `${(timeLeft / 60) * 100}%` }}
                />
              </div>
            </div>

            {!hasVoted ? (
              <div className="space-y-4 relative z-10 flex flex-col">
                {votingOptions.length > 0 ? (
                  votingOptions.map((opt) => {
                    const isOwnAnswer = opt.user_id === userId;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleVoteSubmit(opt.id)}
                        disabled={isOwnAnswer || isSubmittingVote}
                        className={`w-full py-5 px-6 rounded-2xl text-left transition-all text-lg font-medium border ${
                          isOwnAnswer 
                            ? 'bg-neutral-900/50 border-neutral-800/50 text-neutral-600 cursor-not-allowed'
                            : opt.id === selectedVoteId
                            ? 'bg-white/20 border-white ring-2 ring-white scale-[0.98] text-white shadow-lg shadow-white/10'
                            : 'bg-neutral-800/80 hover:bg-indigo-600/20 border-neutral-700 hover:border-indigo-500/50 text-white shadow-lg hover:shadow-[0_0_20px_rgba(99,102,241,0.15)] active:scale-[0.98]'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span>{opt.answer_text}</span>
                          {isOwnAnswer && (
                            <span className="text-[10px] font-bold uppercase tracking-widest bg-neutral-800 text-neutral-400 px-2.5 py-1 rounded-md">
                              Ваш ответ
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="flex justify-center p-8 text-neutral-500 animate-pulse font-medium">Сбор ответов...</div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-8 text-center relative z-10 animate-in zoom-in-95 duration-500">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-400/20 to-indigo-600/20 rounded-full flex items-center justify-center border border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="space-y-3 max-w-md">
                  <h3 className="text-3xl font-extrabold text-white">Ваш голос принят!</h3>
                  <p className="text-neutral-400 text-lg font-medium">
                    Подсчет голосов ({submittedVotesCount}/{players.length})...
                  </p>
                </div>
                <div className="flex gap-2.5 pt-4">
                  <div className="w-3.5 h-3.5 rounded-full bg-indigo-500/80 animate-bounce shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-3.5 h-3.5 rounded-full bg-indigo-500/80 animate-bounce shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-3.5 h-3.5 rounded-full bg-indigo-500/80 animate-bounce shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // --- ROUND 1 WIDGET ---
  if (room?.status === 'Round 1') {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center justify-center p-4 md:p-8 font-sans selection:bg-indigo-500/30">
        <main className="w-full max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <header className="text-center space-y-6">
            <div className="inline-block px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(16,185,129,0.1)]">
              Раунд {room?.current_round || 1}
            </div>
            
            <div className="min-h-[120px] flex items-center justify-center">
              {currentQuestion ? (
                <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-br from-white via-neutral-100 to-neutral-400 bg-clip-text text-transparent leading-tight drop-shadow-sm">
                  {currentQuestion.question_text}
                </h1>
              ) : (
                <div className="flex flex-col items-center gap-4 text-neutral-500">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-xl font-medium animate-pulse">Подготовка вопроса...</div>
                </div>
              )}
            </div>
          </header>

          <div className="bg-neutral-900/60 p-6 md:p-10 rounded-3xl border border-neutral-800/80 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

            {/* Countdown Timer Widget */}
            <div className="w-full space-y-2 mb-8 relative z-10">
              <div className="flex justify-between items-center text-sm font-semibold tracking-wider text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${timeLeft <= 10 ? 'bg-rose-500 animate-ping' : 'bg-indigo-500 animate-pulse'}`}></span>
                  {timeLeft <= 10 ? 'ВРЕМЯ НА ИСХОДЕ!' : 'ОСТАЛОСЬ ВРЕМЕНИ:'}
                </span>
                <span className={`font-mono text-lg font-black ${timeLeft <= 10 ? 'text-rose-500 scale-110' : 'text-indigo-400'} transition-all duration-300`}>
                  {timeLeft} сек
                </span>
              </div>
              <div className="h-3 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 p-0.5">
                <div 
                  className={`h-full rounded-full transition-all duration-1000 ${
                    timeLeft <= 10 
                      ? 'bg-gradient-to-r from-red-500 to-rose-600 animate-[pulse_1s_infinite]' 
                      : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'
                  }`}
                  style={{ width: `${(timeLeft / 60) * 100}%` }}
                />
              </div>
            </div>

            {!hasAnswered ? (
              <form onSubmit={handleAnswerSubmit} className="space-y-6 relative z-10">
                <div>
                  <label htmlFor="answer" className="block text-sm font-semibold text-neutral-400 mb-3 uppercase tracking-wider pl-1">
                    Ваш ответ
                  </label>
                  <input
                    type="text"
                    id="answer"
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    placeholder="Введите ваш оригинальный ответ..."
                    className="w-full bg-neutral-950/50 border border-neutral-700/80 rounded-2xl px-6 py-5 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-xl shadow-inner"
                    required
                    disabled={isSubmittingAnswer || !currentQuestion}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingAnswer || !currentQuestion || !answerText.trim()}
                  className={`w-full text-white font-bold py-5 px-8 rounded-2xl transition-all active:scale-[0.98] text-xl ${
                    isAnswerSubmittedClicked
                      ? 'bg-white/20 ring-2 ring-white'
                      : 'bg-indigo-600 hover:bg-indigo-500 shadow-[0_0_30px_rgba(79,70,229,0.2)] hover:shadow-[0_0_40px_rgba(79,70,229,0.3)]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isSubmittingAnswer ? 'Отправка...' : 'Ответить'}
                </button>
              </form>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-8 text-center relative z-10 animate-in zoom-in-95 duration-500">
                <div className="w-24 h-24 bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 rounded-full flex items-center justify-center border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="space-y-3 max-w-md">
                  <h3 className="text-3xl font-extrabold text-white">Ваш ответ принят!</h3>
                  <p className="text-neutral-400 text-lg font-medium">
                    Ожидание ответов других игроков ({submittedAnswersCount}/{players.length})...
                  </p>
                </div>
                <div className="flex gap-2.5 pt-4">
                  <div className="w-3.5 h-3.5 rounded-full bg-indigo-500/80 animate-bounce shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-3.5 h-3.5 rounded-full bg-indigo-500/80 animate-bounce shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-3.5 h-3.5 rounded-full bg-indigo-500/80 animate-bounce shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // --- TRANSITION WIDGET ---
  if (room?.status === 'Starting') {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-neutral-950 to-neutral-950"></div>
        
        <div className="z-10 flex flex-col items-center justify-center text-center space-y-8">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-32 h-32 md:w-48 md:h-48 border-4 border-indigo-500/30 rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]"></div>
            <div className="absolute w-24 h-24 md:w-36 md:h-36 border-4 border-emerald-500 border-t-transparent border-r-transparent rounded-full animate-spin"></div>
            <div className="w-16 h-16 md:w-24 md:h-24 bg-indigo-500/20 rounded-full shadow-[0_0_50px_rgba(99,102,241,0.5)]"></div>
          </div>
          
          <div className="space-y-4 max-w-md px-4 mt-8">
            <h1 className="text-4xl md:text-5xl font-black text-white tracking-widest uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
              Игра начинается...
            </h1>
            <p className="text-indigo-300 text-lg md:text-xl font-medium animate-pulse">
              Приготовьтесь, сейчас появится первый вопрос
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- DEFAULT LOBBY WIDGET ('Waiting' or fallback) ---
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      {renderMuteButton()}
      <main className="w-full max-w-2xl mt-8 md:mt-16 space-y-8">
        
        <header className="text-center space-y-2">
          <h1 className="text-xl md:text-2xl font-semibold text-neutral-500 uppercase tracking-widest">Игровое лобби</h1>
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="bg-neutral-900/40 px-8 py-4 rounded-3xl border border-neutral-800 flex items-center justify-center">
              <span className="text-6xl md:text-8xl font-mono font-black tracking-widest text-indigo-400 uppercase drop-shadow-md">
                {room?.room_code}
              </span>
            </div>
            {hasCopied ? (
              <p className="text-emerald-400 text-sm font-medium animate-pulse">Ссылка скопирована в буфер обмена!</p>
            ) : (
              <p className="text-neutral-400 text-sm">Поделитесь этим кодом или ссылкой с друзьями</p>
            )}

            {/* Dynamic QR Code Generator */}
            {(() => {
              const qrUrl = qrSource === 'web' 
                ? `https://jxovo.fun/room/${roomCode}` 
                : `https://t.me/JXOVO_bot/jxovo?startapp=${roomCode}`;
              
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-4 bg-neutral-900/30 p-5 rounded-2xl border border-neutral-800/80 backdrop-blur-sm shadow-xl mt-4 w-full max-w-[280px]"
                >
                  {/* Toggle buttons */}
                  <div className="flex bg-neutral-950 rounded-xl p-1 border border-neutral-800/60 text-xs font-semibold w-full">
                    <button
                      onClick={() => setQrSource('web')}
                      className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
                        qrSource === 'web' 
                          ? 'bg-indigo-600 text-white shadow-md' 
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      В браузер
                    </button>
                    <button
                      onClick={() => setQrSource('tg')}
                      className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
                        qrSource === 'tg' 
                          ? 'bg-emerald-600 text-white shadow-md' 
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      В Telegram
                    </button>
                  </div>

                  {/* QR Code SVG */}
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    className="bg-white p-3 rounded-xl shadow-lg border border-neutral-200 flex items-center justify-center cursor-pointer"
                  >
                    <QRCodeSVG 
                      id="qr-code-svg"
                      value={qrUrl} 
                      size={130} 
                      bgColor="#FFFFFF"
                      fgColor="#0A0A0A"
                      level="M"
                    />
                  </motion.div>
                  
                  <p className="text-[10px] text-neutral-500 text-center font-medium leading-relaxed">
                    Отсканируйте камерой телефона для быстрого подключения!
                  </p>

                  {/* Actions Bar */}
                  <div className="flex flex-col gap-2 w-full">
                    <div className="flex gap-2 w-full">
                      {/* Copy Link Button */}
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          const link = qrSource === 'web' 
                            ? `https://jxovo.fun/room/${roomCode}` 
                            : `https://t.me/JXOVO_bot/jxovo?startapp=${roomCode}`;
                          copyToClipboard(link);
                        }}
                        className="flex-1 py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer text-[11px] border border-neutral-700/60"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Ссылка
                      </motion.button>

                      {/* Copy QR Button */}
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCopyQR}
                        className="flex-1 py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer text-[11px] border border-neutral-700/60"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002-2h2a2 2 0 002-2m0 0h2a2 2 0 012 2v3m-2 4h10m-5-5v10" />
                        </svg>
                        Копировать QR
                      </motion.button>
                    </div>

                    {/* Mobile Native Share Button */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleShareInvite}
                      className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-md flex md:hidden items-center justify-center gap-1.5 cursor-pointer text-[11px]"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 10.742l4.606-2.303m0 0L17.5 7.5m-4.21 2.953l4.607 2.303M12 12a1 1 0 110-2 1 1 0 010 2zm0-5a1 1 0 110-2 1 1 0 010 2zm0 10a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                      Поделиться
                    </motion.button>
                  </div>

                  {/* Toast/Label Feedback */}
                  <AnimatePresence mode="wait">
                    {hasCopied && (
                      <motion.p
                        key="copied-link"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="text-[10px] text-emerald-400 font-semibold animate-pulse text-center mt-1"
                      >
                        Ссылка скопирована!
                      </motion.p>
                    )}
                    {qrCopied && (
                      <motion.p
                        key="copied-qr"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="text-[10px] text-emerald-400 font-semibold animate-pulse text-center mt-1"
                      >
                        QR-код скопирован как картинка!
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })()}
          </div>
        </header>

        <div className="bg-neutral-900/60 p-6 rounded-3xl border border-neutral-800/80 shadow-2xl backdrop-blur-md">
          <div className="flex flex-col mb-6 px-2">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
              <div className="flex items-center gap-4 flex-wrap">
                <h2 className="text-xl font-semibold flex items-center gap-3">
                  <span className="h-5 w-1.5 bg-emerald-500 rounded-full"></span>
                  Игроки
                  <span className="bg-neutral-800 text-neutral-400 text-sm px-2.5 py-0.5 rounded-full ml-1">
                    {players.length}
                  </span>
                </h2>
                
                {isHost && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      placeholder="Имя бота (необяз.)"
                      value={customBotName}
                      onChange={(e) => setCustomBotName(e.target.value)}
                      disabled={isAddingBot}
                      className="bg-neutral-950/60 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 w-32 sm:w-36 transition-all"
                    />
                    <button 
                      onClick={handleAddBot}
                      disabled={isAddingBot}
                      className="flex items-center gap-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg border border-neutral-700 transition-colors disabled:opacity-50 animate-gentle-blink cursor-pointer"
                    >
                      {isAddingBot ? (
                        <div className="w-3 h-3 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                        </svg>
                      )}
                      Добавить бота
                    </button>
                  </div>
                )}
              </div>
              
              <div className="text-xs font-medium text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20 uppercase tracking-wider self-start sm:self-center">
                {getLocalizedStatus(room?.status)}
              </div>
            </div>
            
            {isHost && (
              <span className="text-xs text-neutral-500 w-full text-left mt-1">
                Боты нужны, чтобы можно было играть даже одному или неполной компанией
              </span>
            )}
          </div>
          
          <ul className="space-y-3">
            {players.map((player) => (
              <li 
                key={player.id} 
                className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${player.id === userId ? 'bg-indigo-900/20 border-indigo-500/30 shadow-[inset_0_0_20px_rgba(99,102,241,0.05)]' : 'bg-neutral-950/50 border-neutral-800/80'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-xl shadow-inner ${player.id === room?.host_id ? 'bg-gradient-to-br from-amber-400/20 to-amber-600/20 text-amber-400 border border-amber-500/30' : 'bg-neutral-800 text-neutral-300 border border-neutral-700'}`}>
                    {player.nickname.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-white flex items-center gap-2 text-lg">
                      {player.nickname}
                      {player.id === userId && (
                        <span className="text-[10px] font-bold bg-indigo-500 text-white px-2 py-0.5 rounded-md uppercase tracking-wider">ВЫ</span>
                      )}
                      {player.role === 'Bot' && (
                        <span className="text-[10px] font-bold bg-neutral-600 text-neutral-200 px-2 py-0.5 rounded-md uppercase tracking-wider">БОТ</span>
                      )}
                    </div>
                    {player.id === room?.host_id && (
                      <div className="text-xs text-amber-500/80 font-semibold uppercase tracking-wider mt-0.5">ХОСТ</div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          
          {players.length === 1 && (
            <div className="mt-8 mb-4 flex flex-col items-center justify-center text-center text-neutral-500 space-y-3">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-neutral-600 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-neutral-600 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-neutral-600 animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
              <p className="text-sm font-medium">Ожидание других игроков...</p>
            </div>
          )}
        </div>

        {/* Cross-Platform Info Block */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-neutral-900/40 border border-neutral-800/60 backdrop-blur-sm p-6 rounded-3xl shadow-xl space-y-4"
        >
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="text-2xl">🌐</span> JXOVO — играй как удобно!
          </h3>
          <ul className="space-y-2.5 text-sm text-neutral-300">
            <li className="flex items-center gap-2">
              <span className="font-semibold text-indigo-400">Сайт:</span>
              <a href="https://jxovo.fun" target="_blank" rel="noopener noreferrer" className="hover:underline text-indigo-300 transition-colors">
                jxovo.fun
              </a>
            </li>
            <li className="flex items-center gap-2">
              <span className="font-semibold text-indigo-400">Бот:</span>
              <a href="https://t.me/JXOVO_bot" target="_blank" rel="noopener noreferrer" className="hover:underline text-indigo-300 transition-colors">
                @JXOVO_bot
              </a>
            </li>
            <li className="flex items-center gap-2">
              <span className="font-semibold text-indigo-400">Telegram:</span>
              <a href="https://t.me/JXOVO_bot/jxovo" target="_blank" rel="noopener noreferrer" className="hover:underline text-indigo-300 transition-colors">
                t.me/JXOVO_bot/jxovo
              </a>
            </li>
          </ul>
          <div className="pt-2 border-t border-neutral-800/40 text-xs text-neutral-400 font-medium">
            Одна комната для всех — заходи из браузера или прямо в Telegram!
          </div>
        </motion.div>

        <div className="pt-6 pb-12 flex flex-col items-center w-full gap-3">
          {isHost ? (
            <button 
              onClick={handleStartGame}
              className="w-full md:w-auto md:min-w-[280px] px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-[0_0_40px_rgba(16,185,129,0.2)] hover:shadow-[0_0_60px_rgba(16,185,129,0.3)] transition-all active:scale-[0.98] text-lg cursor-pointer"
            >
              Начать игру
            </button>
          ) : (
            <div className="w-full flex items-center justify-center gap-3 bg-neutral-900/60 p-5 rounded-2xl border border-neutral-800 text-neutral-400 backdrop-blur-sm">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <span className="font-medium">Ожидание старта игры...</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
