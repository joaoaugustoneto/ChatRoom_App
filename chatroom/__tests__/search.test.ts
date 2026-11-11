import { filterMessages } from '@/utils/search';
import type { Message } from '@/types';

const base: Message = {
  id: '1',
  roomId: 'r1',
  userId: 'u1',
  body: 'Olá, pessoal do React Native!',
  createdAt: '2026-09-20T10:00:00Z',
  username: 'Alice',
  avatarColor: '#2563EB',
};

describe('filterMessages', () => {
  it('retorna a lista completa se o termo for vazio', () => {
    expect(filterMessages([base], '')).toEqual([base]);
    expect(filterMessages([base], '   ')).toEqual([base]);
  });

  it('encontra mensagem pelo texto da mensagem (case insensitive)', () => {
    const res = filterMessages([base], 'react');
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('1');
  });

  it('encontra mensagem pelo nome do autor', () => {
    const res = filterMessages([base], 'alice');
    expect(res).toHaveLength(1);
  });

  it('retorna vazio quando não há correspondência', () => {
    const res = filterMessages([base], 'Flutter');
    expect(res).toHaveLength(0);
  });
});
