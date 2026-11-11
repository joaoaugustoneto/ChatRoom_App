import type { Message } from '@/types';
import {
  formatDaySeparator,
  formatMessageTime,
  groupMessagesByDay,
  shouldGroupWithPrevious,
} from '@/utils/messages';

const msg = (over: Partial<Message>): Message => ({
  id: 'm1',
  roomId: 'r1',
  userId: 'u1',
  body: 'oi',
  createdAt: '2026-09-20T10:00:00Z',
  username: 'Ana',
  avatarColor: '#000',
  ...over,
});

describe('shouldGroupWithPrevious', () => {
  it('agrupa do mesmo autor dentro de 5 minutos', () => {
    const a = msg({ createdAt: '2026-09-20T10:00:00Z' });
    const b = msg({ createdAt: '2026-09-20T10:04:00Z' });
    expect(shouldGroupWithPrevious(b, a)).toBe(true);
  });

  it('não agrupa depois de 5 minutos', () => {
    const a = msg({ createdAt: '2026-09-20T10:00:00Z' });
    const b = msg({ createdAt: '2026-09-20T10:06:00Z' });
    expect(shouldGroupWithPrevious(b, a)).toBe(false);
  });

  it('não agrupa autores diferentes', () => {
    const a = msg({ userId: 'u1' });
    const b = msg({ userId: 'u2', createdAt: '2026-09-20T10:01:00Z' });
    expect(shouldGroupWithPrevious(b, a)).toBe(false);
  });

  it('sem mensagem anterior, nunca agrupa', () => {
    expect(shouldGroupWithPrevious(msg({}), undefined)).toBe(false);
  });
});

describe('formatMessageTime', () => {
  it('formata hora:minuto com dois digitos', () => {
    expect(formatMessageTime('2026-09-20T05:03:00Z')).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('formatDaySeparator', () => {
  const now = new Date('2026-09-20T15:00:00');

  it('reconhece hoje e ontem', () => {
    expect(formatDaySeparator('2026-09-20T09:00:00', now)).toBe('Hoje');
    expect(formatDaySeparator('2026-09-19T09:00:00', now)).toBe('Ontem');
  });

  it('mostra a data por extenso para dias mais antigos', () => {
    expect(formatDaySeparator('2026-09-10T09:00:00', now)).toContain('setembro');
  });
});

describe('groupMessagesByDay', () => {
  const now = new Date('2026-09-20T15:00:00');

  it('agrupa mantendo a ordem dos dias', () => {
    const messages = [
      msg({ id: '1', createdAt: '2026-09-19T09:00:00Z' }),
      msg({ id: '2', createdAt: '2026-09-19T10:00:00Z' }),
      msg({ id: '3', createdAt: '2026-09-20T09:00:00Z' }),
    ];
    const sections = groupMessagesByDay(messages, now);
    
    expect(sections.map((s) => s.label)).toEqual(['Ontem', 'Hoje']);
    expect(sections[0].messages).toHaveLength(2);
    expect(sections[1].messages).toHaveLength(1);
  });

  it('lista vazia gera nenhuma seção', () => {
    expect(groupMessagesByDay([], now)).toEqual([]);
  });
});
