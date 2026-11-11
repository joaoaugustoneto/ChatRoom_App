import type { Message } from '@/types';

export function filterMessages(messages: Message[], query: string): Message[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return messages;

  return messages.filter(
    (m) =>
      m.body.toLowerCase().includes(clean) || m.username.toLowerCase().includes(clean),
  );
}
