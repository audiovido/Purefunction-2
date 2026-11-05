/** Basic TrueCoach-style pilot is the default; heavyweight screens are opt-in. */
export const FULL_FEATURES = import.meta.env.VITE_FULL_FEATURES === 'true';
export const BASIC_COACH_NAV = ['clients', 'library', 'messages'] as const;
export const BASIC_CLIENT_SECTIONS = ['exercises', 'notes'] as const;
export const BASIC_CLIENT_NAV = ['today', 'messages'] as const;

export const isBasicCoachNav = (tab: string): boolean => BASIC_COACH_NAV.some(x => x === tab);
export const isBasicClientSection = (tab: string): boolean => BASIC_CLIENT_SECTIONS.some(x => x === tab);
export const isBasicClientNav = (tab: string): boolean => BASIC_CLIENT_NAV.some(x => x === tab);
