/** DRAFT — PENDING HAMOON + QUALIFIED REVIEWER APPROVAL.
 * This file intentionally does NOT infer a PRI presentation from ROM or symptoms.
 * AIA Spectrum of Patterns and PRI's Left AIC / Right BC are separate frameworks.
 */
export const PATTERN_RULE_VERSION = 'draft-v1-2026-11-04';
export const REVIEW_STATUS = 'DRAFT — PENDING HAMOON + QUALIFIED REVIEWER APPROVAL';
export const PATTERN_FRAMEWORKS = {
  AIA: 'Applied Integration Academy — Spectrum of Patterns',
  PRI: 'PRI terminology — only coach-confirmed, never extrapolated from AIA'
} as const;
export const draftInterpretation = () => ({ status: 'insufficient' as const,
  support: [] as string[], conflict: [] as string[], missing: ['Reviewer-approved pattern rules', 'Required specific tests and gait observations'] });
