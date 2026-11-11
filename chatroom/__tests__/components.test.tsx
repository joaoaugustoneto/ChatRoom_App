import React from 'react';
import { screen, fireEvent, render } from '@testing-library/react-native';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { TypingIndicator } from '@/components/TypingIndicator';
import { RoomCard } from '@/components/RoomCard';
import type { Room } from '@/types';

describe('Componentes com React Native Testing Library (Apêndice C)', () => {
  describe('Button', () => {
    it('renderiza o título e dispara o callback onPress', async () => {
      const onPressMock = jest.fn();
      await render(<Button title="Clique aqui" onPress={onPressMock} />);

      const button = screen.getByText('Clique aqui');
      expect(button).toBeTruthy();
      fireEvent.press(button);
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    it('não dispara onPress quando desabilitado', async () => {
      const onPressMock = jest.fn();
      await render(<Button title="Desabilitado" onPress={onPressMock} disabled />);

      fireEvent.press(screen.getByText('Desabilitado'));
      expect(onPressMock).not.toHaveBeenCalled();
    });
  });

  describe('Avatar', () => {
    it('exibe as iniciais em maiúsculo calculadas corretamente', async () => {
      await render(<Avatar username="Bruno Dias" color="#2563EB" size={40} />);
      expect(screen.getByText('BD')).toBeTruthy();
    });
  });

  describe('TypingIndicator', () => {
    it('não renderiza texto quando a lista de digitando estiver vazia', async () => {
      await render(<TypingIndicator usernames={[]} />);
      expect(screen.queryByText(/digitando/i)).toBeNull();
    });

    it('renderiza texto formatado quando usuários estão digitando', async () => {
      await render(<TypingIndicator usernames={['Alice', 'Bob']} />);
      expect(screen.getByText('Alice e Bob estão digitando...')).toBeTruthy();
    });
  });

  describe('RoomCard', () => {
    it('renderiza dados da sala e selo de participação quando membro', async () => {
      const room: Room = {
        id: 'r1',
        name: 'Sala Geral',
        description: 'Bate papo livre',
        emoji: '💬',
        createdBy: 'u1',
        createdAt: '2026-09-20T10:00:00Z',
        memberCount: 5,
        isPrivate: true,
      };
      const onPressMock = jest.fn();

      await render(<RoomCard room={room} isMember={true} onPress={onPressMock} />);

      expect(screen.getByText('Sala Geral')).toBeTruthy();
      expect(screen.getByText('Bate papo livre')).toBeTruthy();
      expect(screen.getByText('💬')).toBeTruthy();
      expect(screen.getByText('Você participa')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();

      fireEvent.press(screen.getByText('Sala Geral'));
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });
  });
});
