-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nickname TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Player', 'Bot')),
    avatar_id INT
);

-- Rooms Table
CREATE TABLE public.rooms (
    room_code VARCHAR(4) PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('Waiting', 'Round 1', 'Round 2')),
    host_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    users_ids UUID[] DEFAULT '{}',
    users_num INT DEFAULT 0
);

-- Questions Table
CREATE TABLE public.questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_text TEXT NOT NULL,
    category TEXT
);

-- Game_Sessions Table
CREATE TABLE public.game_sessions (
    room_code VARCHAR(4) NOT NULL REFERENCES public.rooms(room_code) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    score INT DEFAULT 0,
    PRIMARY KEY (room_code, user_id)
);

-- Answers Table
CREATE TABLE public.answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL
);

-- Votes Table
CREATE TABLE public.votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    answer_id UUID NOT NULL REFERENCES public.answers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);
