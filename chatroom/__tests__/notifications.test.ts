import {
  buildPushNotifications,
  RecipientToken,
} from '@/utils/notifications';

describe('buildPushNotifications', () => {
  it('filtra o próprio remetente e monta o payload da notificação', () => {
    const recipients: RecipientToken[] = [
      { userId: 'user-alice', pushToken: 'ExponentPushToken[alice123]' },
      { userId: 'user-bob', pushToken: 'ExponentPushToken[bob456]' },
      { userId: 'user-carl', pushToken: 'ExponentPushToken[carl789]' },
    ];

    const notifications = buildPushNotifications({
      recipients,
      senderId: 'user-alice',
      senderUsername: 'Alice',
      roomName: 'Geral',
      messageId: 'msg-001',
      roomId: 'room-001',
      messageBody: 'Olá mundo!',
    });

    // Alice não deve receber notificação da sua própria mensagem
    expect(notifications).toHaveLength(2);
    expect(notifications[0]).toEqual({
      to: 'ExponentPushToken[bob456]',
      sound: 'default',
      title: 'Geral',
      body: 'Alice: Olá mundo!',
      data: {
        roomId: 'room-001',
        messageId: 'msg-001',
      },
    });
    expect(notifications[1].to).toBe('ExponentPushToken[carl789]');
  });

  it('ignora tokens vazios ou inválidos', () => {
    const recipients: RecipientToken[] = [
      { userId: 'user-bob', pushToken: '   ' },
      { userId: 'user-carl', pushToken: 'ExponentPushToken[valid]' },
    ];

    const notifications = buildPushNotifications({
      recipients,
      senderId: 'user-alice',
      senderUsername: 'Alice',
      roomName: 'TypeScript',
      messageId: 'msg-002',
      roomId: 'room-002',
      messageBody: 'Novo código',
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].to).toBe('ExponentPushToken[valid]');
  });
});
