const PALETTE = [
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#059669',
  '#D97706',
  '#DC2626',
  '#089182',
];

// Cor deterministica a partir de um id: o mesmo usuário sempre recebe a
// mesma cor, sem precisar guardar isso em lugar nenhum.
export function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

// Iniciais para o avatar: "Ana Souza" -> "AS", "ana" -> "A".
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
