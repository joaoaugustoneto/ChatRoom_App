import { formatTypingIndicator } from '@/utils/typing';

describe('formatTypingIndicator', () => {
  it('ninguém digitando: texto vazio', () => {
    expect(formatTypingIndicator([])).toBe('');
  });

  it('uma pessoa', () => {
    expect(formatTypingIndicator(['Ana'])).toBe('Ana está digitando...');
  });

  it('duas pessoas', () => {
    expect(formatTypingIndicator(['Ana', 'Bruno'])).toBe(
      'Ana e Bruno estão digitando...',
    );
  });

  it('três ou mais pessoas', () => {
    expect(formatTypingIndicator(['Ana', 'Bruno', 'Carlos'])).toBe(
      'Várias pessoas estão digitando...',
    );
  });

  it('remove nomes duplicados antes de decidir', () => {
    expect(formatTypingIndicator(['Ana', 'Ana'])).toBe('Ana está digitando...');
  });
});
