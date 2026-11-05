# Basic Pilot database review — approval packet

PR: https://github.com/audiovido/Purefunction-2/pull/38

Status: source review completed; **no SQL has been executed, including locally or in staging**. The live schema and data have not been read in this review. A green app/mock CI does not prove real PostgreSQL RLS behavior.

Validation: all three proposed SQL files passed PostgreSQL grammar parsing with pglast (migration: 32 statements; rollback: 21; read-only preflight: 9). The preflight's parsed statement types are limited to transaction controls, session-local settings and SELECT. This validates syntax and statement scope, not PL/pgSQL runtime behavior, existing schema, permissions or live RLS.

## Findings addressed before execution

| Finding | Change | Still to verify on approved staging |
| --- | --- | --- |
| Client INSERT uses `.insert(...).select('updated_at')`. Its SELECT policy called a STABLE helper that re-read the inserted row; that snapshot cannot see the calling statement's changes. | Check the returned row's `coach_id` directly in the clients SELECT policy. Keep the existing owner helper for related tables. Rollback restores the prior SELECT policy before removing the owner column. | A verified coach inserts a client with RETURNING; gets the timestamp and their owner UUID; the legacy assignment is created in the same transaction. |
| Existing owners could lose all access after the new verified/allowlisted-coach requirement. | Migration aborts before any schema change if an assigned owner is not a verified, allowlisted coach. Also requires a configured, verified, allowlisted head coach. | Preflight count of invalid owners is zero; exactly one eligible head coach. Resolve blockers explicitly; never guess owners. |
| A NULL management action skipped the `<> 'invite'` guard. | Use `IS DISTINCT FROM 'invite'` so NULL and every non-invite action are rejected. | Head-coach RPC rejects NULL, assign and unassign; only invite works. |

The INSERT/RETURNING issue is inferred from source and PostgreSQL snapshot/RLS rules, not reproduced against a database here. References:
- https://www.postgresql.org/docs/current/xfunc-volatility.html (data visibility of STABLE functions)
- https://www.postgresql.org/docs/current/sql-createpolicy.html (SELECT checks on INSERT/UPDATE RETURNING)

## Exact scope of the first approval

Approve execution of **only** `supabase/pending/NEEDS_ARMIN_OK_basic_preflight_readonly.sql` on the existing Supabase project. It starts a read-only repeatable-read transaction with 3-second lock and 15-second statement timeouts and ends in ROLLBACK. It reports prerequisite objects, aggregate ownership/email blockers, RLS policies and trigger definitions. It does not output client names, emails, health records or auth tokens. It does not change schema, data, access, settings persistently, or send email.

The first approval does **not** authorize the migration, staging writes, backups/exports, Edge deployment, merge or site deployment. The migration and rollback require separate explicit approval.

## Required interpretation of preflight results

- Required T8b/p5 tables/functions must exist; Basic owner column should not already exist for a first application.
- Ownerless clients, clients with multiple owners, invalid/unverified/unallowlisted owners and duplicate nonempty email groups must all be zero. Eligible head-coach count must be exactly one.
- Every listed protected table must have RLS enabled. Inspect policy expressions, not just names: any extra permissive policy can widen access. Compare actual trigger definitions with the committed T8b source.
- If a prerequisite or expected protected table is missing, or any value is unexpected, stop. Do not interpret missing rows as a successful check.
- The one-email/one-client-record model must be acceptable to Armin. Blank emails remain allowed; shared exercise-library access remains intentional.

## Later staging acceptance, under separate approval

1. Back up relevant schema and client/assignment/workout/profile/auth data with access controls. A rollback SQL file is not a data backup. Do not publish private backups in GitHub or CI logs.
2. On an approved staging copy, apply the exact reviewed migration as the expected DB owner. Verify function ownership, grants, trigger order and RLS under real authenticated roles; do not test only as service_role/table owner.
3. Exercise `INSERT ... RETURNING` without supplying coach_id, explicit own coach_id, a forged other-owner ID, ordinary profile updates and client photo/log updates. Check both owner immutability and cross-coach read/write denial on clients, workouts, notes, messages, profiles and storage.
4. Test anonymous, stranger, unverified coach, revoked allowlist coach and both real clients. Client results must still use the existing results-only RPC; prescriptions stay unchanged.
5. Verify no ownerless/multi-owner clients remain, every client has exactly one matching assignment and duplicate nonempty emails are rejected. Deliberately ambiguous staging data must abort the migration transaction without partial changes.
6. Validate app and `send-invite` with real JWTs. Confirm a nonowner cannot send another coach's client email. Head-only coach administration cannot transfer existing clients.
7. Revert app/Edge to compatible prior versions, then test the reviewed rollback on staging. Verify prior policies/helpers and existing data/assignments survive. Rollback restores prior shared-assignment access; it is not a substitute for a backup.

Only after those results are reviewed should production SQL/Edge rollout and merging be approved explicitly. Main still auto-deploys Pages on merge.
