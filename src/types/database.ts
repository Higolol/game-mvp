export type UserRole = 'Player' | 'Bot';
export type RoomStatus = 'Waiting' | 'Round 1' | 'Round 2';

export interface User {
  id: string; // UUID
  nickname: string;
  role: UserRole;
  avatar_id: number | null;
}

export interface Room {
  room_code: string; // VARCHAR(4)
  status: RoomStatus;
  host_id: string; // UUID
  users_ids: string[]; // Array of UUIDs
  users_num: number;
}

export interface Question {
  id: string; // UUID
  question_text: string;
  category: string | null;
}

export interface GameSession {
  room_code: string; // VARCHAR(4)
  user_id: string; // UUID
  score: number;
}

export interface Answer {
  id: string; // UUID
  question_id: string; // UUID
  user_id: string; // UUID
  answer_text: string;
}

export interface Vote {
  id: string; // UUID
  answer_id: string; // UUID
  user_id: string; // UUID
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id'> & { id?: string };
        Update: Partial<User>;
      };
      rooms: {
        Row: Room;
        Insert: Room;
        Update: Partial<Room>;
      };
      questions: {
        Row: Question;
        Insert: Omit<Question, 'id'> & { id?: string };
        Update: Partial<Question>;
      };
      game_sessions: {
        Row: GameSession;
        Insert: GameSession;
        Update: Partial<GameSession>;
      };
      answers: {
        Row: Answer;
        Insert: Omit<Answer, 'id'> & { id?: string };
        Update: Partial<Answer>;
      };
      votes: {
        Row: Vote;
        Insert: Omit<Vote, 'id'> & { id?: string };
        Update: Partial<Vote>;
      };
    };
  };
}
