import { groupReactions } from '@/utils/reactions';

describe('groupReactions', () => {
  it('retorna array vazio quando não há reações', () => {
    expect(groupReactions([])).toEqual([]);
  });

  it('agrupa múltiplas reações do mesmo emoji somando a contagem', () => {
    const raw = [
      { emoji: '👍', userId: 'user1' },
      { emoji: '👍', userId: 'user2' },
      { emoji: '❤️', userId: 'user1' },
    ];
    const grouped = groupReactions(raw);

    expect(grouped).toHaveLength(2);
    expect(grouped.find((g) => g.emoji === '👍')).toEqual({
      emoji: '👍',
      count: 2,
      userIds: ['user1', 'user2'],
    });
    expect(grouped.find((g) => g.emoji === '❤️')).toEqual({
      emoji: '❤️',
      count: 1,
      userIds: ['user1'],
    });
  });

  it('ignora duplicatas do mesmo usuário no mesmo emoji', () => {
    const raw = [
      { emoji: '🔥', userId: 'user1' },
      { emoji: '🔥', userId: 'user1' },
    ];
    const grouped = groupReactions(raw);
    expect(grouped).toEqual([{ emoji: '🔥', count: 1, userIds: ['user1'] }]);
  });
});
