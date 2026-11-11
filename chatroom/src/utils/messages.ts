import type { Message } from '@/types';

// Duas mensagens seguidas do mesmo autor, proximas no tempo, formam um
// "grupo": só a primeira mostra o nome e o avatar, como em qualquer chat.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function shouldGroupWithPrevious(
  current: Message,
  previous: Message | undefined,
): boolean {
  if (!previous) return false;
  if (current.userId !== previous.userId) return false;

  const gap =
    new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
  return gap >= 0 && gap <= GROUP_WINDOW_MS;
}

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

// "Hoje", "Ontem" ou a data por extenso — para separar os dias na lista.
export function formatDaySeparator(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);

  if (sameDay(d, now)) return 'Hoje';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return 'Ontem';

  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export interface MessageSection {
  label: string;
  messages: Message[];
}

// Agrupa as mensagens (mais antigas primeiro) em seções por dia, na ordem em
// que os dias aparecem.
export function groupMessagesByDay(
  messages: Message[],
  now: Date = new Date(),
): MessageSection[] {
  const sections: MessageSection[] = [];
  for (const m of messages) {
    const label = formatDaySeparator(m.createdAt, now);
    const last = sections[sections.length - 1];

    if (last && last.label === label) last.messages.push(m);
    else sections.push({ label, messages: [m] });
  }
  return sections;
}
