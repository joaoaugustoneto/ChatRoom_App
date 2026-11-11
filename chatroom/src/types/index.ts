export interface Profile {
  id: string;
  username: string;
  avatarColor: string;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  emoji: string;
  createdBy: string;
  createdAt: string;
  memberCount?: number;
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  body: string;
  createdAt: string;
  username: string;
  avatarColor: string;
}

// Mensagem ainda não confirmada pelo servidor (mostrada otimisticamente).
export interface PendingMessage extends Message {
  pending: true;
}
