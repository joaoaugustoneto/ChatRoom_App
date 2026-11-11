export interface PushPayload {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: {
    roomId: string;
    messageId: string;
  };
}

export interface RecipientToken {
  userId: string;
  pushToken: string;
}

/**
 * Filtra tokens dos membros da sala removendo o autor da mensagem
 * e monta as cargas para envio via Expo Push Notification API.
 */
export function buildPushNotifications({
  recipients,
  senderId,
  senderUsername,
  roomName,
  messageId,
  roomId,
  messageBody,
}: {
  recipients: RecipientToken[];
  senderId: string;
  senderUsername: string;
  roomName: string;
  messageId: string;
  roomId: string;
  messageBody: string;
}): PushPayload[] {
  return recipients
    .filter((r) => r.userId !== senderId && Boolean(r.pushToken?.trim()))
    .map((r) => ({
      to: r.pushToken.trim(),
      sound: 'default',
      title: roomName,
      body: `${senderUsername}: ${messageBody}`,
      data: {
        roomId,
        messageId,
      },
    }));
}
