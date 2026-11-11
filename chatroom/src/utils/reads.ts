import type { Message } from '@/types';

export type MessageDeliveryStatus = 'pending' | 'sent' | 'read';

export function getMessageDeliveryStatus(
  message: Message,
  isPending: boolean,
): MessageDeliveryStatus {
  if (isPending || message.id.startsWith('temp-')) {
    return 'pending';
  }
  if ((message.readByCount ?? 0) > 0) {
    return 'read';
  }
  return 'sent';
}
