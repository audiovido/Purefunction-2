import { describe, expect, it } from 'vitest';
import { changedFields, emptyJournal, hasPending, mayReplay, pendingKey } from '../../cloud/pendingWrites';

describe('durable cloud write journal', () => {
  it('starts empty and uses a separate journal per signed-in account', () => {
    expect(hasPending(emptyJournal())).toBe(false);
    expect(pendingKey('coach')).not.toBe(pendingKey('client'));
  });
  it('does not replay a stale version from another device', () => {
    expect(mayReplay('old', 'new')).toBe(false);
    expect(mayReplay('current', 'current')).toBe(true);
    expect(mayReplay(null, null)).toBe(true);
  });
  it('distinguishes changed client fields from identical data', () => {
    expect(changedFields({ photoUrl: 'a' }, { photoUrl: 'a' })).toBe(false);
    expect(changedFields({ photoUrl: 'a' }, { photoUrl: 'b' })).toBe(true);
  });
});
