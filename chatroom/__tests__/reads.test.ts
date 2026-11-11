import { getMessageDeliveryStatus } from '@/utils/reads';
import type { Message } from '@/types';

const baseMsg: Message = {
  id: 'msg-1',
  roomId: 'room-1',
  userId: 'user-1',
  body: 'Teste de leitura',
  createdAt: '2026-09-20T10:00:00Z',
  username: 'Alice',
  avatarColor: '#2563EB',
};

describe('getMessageDeliveryStatus', () => {
  it('retorna pending quando isPending é true ou id começa com temp-', () => {
    expect(getMessageDeliveryStatus(baseMsg, true)).toBe('pending');
    expect(getMessageDeliveryStatus({ ...baseMsg, id: 'temp-12345' }, false)).toBe(
      'pending',
    );
  });

  it('retorna sent quando a mensagem foi entregue mas não lida', () => {
    expect(getMessageDeliveryStatus(baseMsg, false)).toBe('sent');
    expect(getMessageDeliveryStatus({ ...baseMsg, readByCount: 0 }, false)).toBe('sent');
  });

  it('retorna read quando readByCount for maior que zero', () => {
    expect(getMessageDeliveryStatus({ ...baseMsg, readByCount: 1 }, false)).toBe('read');
    expect(getMessageDeliveryStatus({ ...baseMsg, readByCount: 3 }, false)).toBe('read');
  });
});
