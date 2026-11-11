import { colorForId, initials } from '@/utils/avatar';

describe('colorForId', () => {
  it('é deterministica: o mesmo id sempre dá a mesma cor', () => {
    expect(colorForId('user-123')).toBe(colorForId('user-123'));
  });

  it('ids diferentes tendem a dar cores diferentes', () => {
    const colors = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(colorForId));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('initials', () => {
  it('duas palavras: primeira letra de cada', () => {
    expect(initials('Ana Souza')).toBe('AS');
  });

  it('uma palavra só: a primeira letra', () => {
    expect(initials('ana')).toBe('A');
  });

  it('nome vazio devolve um simbolo neutro', () => {
    expect(initials('   ')).toBe('?');
  });

  it('nome com sobrenome composto usa a primeira e a última palavra', () => {
    expect(initials('Ana Paula Souza')).toBe('AS');
  });
});