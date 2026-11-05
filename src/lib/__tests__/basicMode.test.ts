import { describe, expect, it } from 'vitest';
import { BASIC_CLIENT_NAV, BASIC_CLIENT_SECTIONS, BASIC_COACH_NAV,
  isBasicClientNav, isBasicClientSection, isBasicCoachNav } from '../basicMode';

describe('default basic pilot navigation', () => {
  it('keeps coach workflow to Clients, Library, Messages', () => {
    expect(BASIC_COACH_NAV).toEqual(['clients','library','messages']);
    expect(isBasicCoachNav('programs')).toBe(false);
    expect(isBasicCoachNav('clients')).toBe(true);
  });
  it('keeps only workouts and private coach notes inside client detail', () => {
    expect(BASIC_CLIENT_SECTIONS).toEqual(['exercises','notes']);
    for (const tab of ['assessment','progression','nutrition','goals']) expect(isBasicClientSection(tab)).toBe(false);
    expect(isBasicClientSection('exercises')).toBe(true);
  });
  it('keeps client phone Today and Chat; no heavy features or referrals', () => {
    expect(BASIC_CLIENT_NAV).toEqual(['today','messages']);
    expect(isBasicClientNav('progress')).toBe(false);
    expect(isBasicClientNav('refer')).toBe(false);
  });
});
