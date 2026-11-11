export interface RawReaction {
  emoji: string;
  userId: string;
}

export interface GroupedReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export function groupReactions(reactions: RawReaction[]): GroupedReaction[] {
  const map = new Map<string, string[]>();

  for (const r of reactions) {
    const list = map.get(r.emoji) ?? [];
    if (!list.includes(r.userId)) {
      list.push(r.userId);
    }
    map.set(r.emoji, list);
  }

  return Array.from(map.entries()).map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    userIds,
  }));
}
