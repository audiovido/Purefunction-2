# Basic Pilot — independent coaches

Production setting (2026-11-06): Armin requested the full previous coaching workspace again. The Pages build explicitly sets `VITE_FULL_FEATURES=true`, restoring the existing Assessment / Body map / Movements / Goals / Progression / Nutrition / Programs and client Progress screens. The independent-owner database rules, strict coach/client sign-in and signed-in role locks remain in force. The ownership-schema gate now applies in both cloud modes. Gait and posture-rule publication retain their separate approval gates. The Basic default described below remains available for isolated pilot/demo builds.

Base: `f8018adc3b2d7fb2c113e3cbb1f2d835937b1961` (main). Branch: `feat/basic-pilot-independent-coaches`.

## Behavior

Basic mode is the default. Coaches use Clients, Library and Messages; only the head coach sees Coaches to allowlist and invite other coaches. Each coach creates and owns their own clients. Clients use Today and Chat; coach client-detail screens show Exercises and Notes. The existing calendar, workout builder, lb display and results-only logging remain in use. The exercise library is shared deliberately. Historical data and assessment code are retained; `VITE_FULL_FEATURES=true` restores heavy screens, but does not restore shared ownership or assignment controls.

Cloud mode checks for `clients.coach_id` before mounting client loading, realtime subscriptions or pending-write replay. A missing schema or failed probe blocks the workspace. This check is a rollout guard; actual authorization depends on database RLS.

The invitation Edge Function looks up clients using the caller's JWT (not the service role), then checks `coach_id` before sending. This respects verified-coach allowlisting and strict owner RLS after the pending migration.

## Local validation

- Exact-base ZIP patch checks and synthetic fail-closed/rollback tests passed.
- `npm run lint`, all 119 Vitest tests and production builds passed.
- `e2e/security-rest.cjs` and `e2e/basic-security-rest.cjs` passed against mock Supabase, including cross-coach isolation, immutable ownership, revoked/unverified coaches, notes, messages and results logging.
- `e2e/basic-cloud-flow.cjs` passed: head invites coach B; separate rosters and workouts; client phone logs a set; only the owning coach sees completion. Missing-schema case verifies no client/workout loading or pending-save RPC occurs.
- Basic responsive crawler passed at 375, 768, 1024 and 1440px with 0 failures and 0 unvisited views. Library and PWA/offline tests passed.
- Legacy full cloud flow passed. Full responsive crawler passed with 0 failures and 0 unvisited views at all four widths, including Posture Overview, Start/New assessment and Reports.
- Unit tests execute the actual `send-invite` handler with stubbed network dependencies. These are not live Edge/DB integration tests.
- Browser tests used Playwright 1.56.1 / Chromium 141. PR CI pins the same version. Existing Vite warnings about config loading and bundle size remain.

## Changes beyond the supplied ZIP

1. Fixed the mock DELETE authorization so clients can delete their own food entries, preserving RPC-only inserts and coach isolation.
2. Moved cloud client-store mounting behind the schema probe; replaced implementation-specific error text with user-facing unavailable-workspace copy.
3. Hardened `send-invite` using caller RLS and added real-handler tests plus revoked/unverified mock cases.
4. Fixed responsive crawler labels for Posture Overview and Start assessment; missing Assessment subviews now count as unvisited.
5. Included proposed SQL and rollback, documentation and the PR-only CI workflow in the branch.

## Approval and release gates

**Do not merge, deploy or execute SQL automatically. No SQL has been executed by this implementation.**

Database source audit and the exact scope of the first read-only approval are in `docs/BASIC_PILOT_DB_REVIEW.md`. Proposed SQL now checks verified/allowlisted existing owners and the head coach, uses the returned client's owner column directly in SELECT RLS for INSERT RETURNING, and rejects NULL coach-management actions. All three proposed SQL files passed PostgreSQL grammar parsing; none was executed. The source-audit fix still requires approved staging verification with real PostgreSQL roles/JWTs.

1. Review `supabase/pending/NEEDS_ARMIN_OK_basic_independent_coaches.sql` and its rollback. Requires existing T8b and p5 schema, verified coach profiles and the head coach on `private.coach_allowlist`.
2. Back up relevant client, assignment, workout, profile and auth data securely. On staging, review every existing client's ownership. The migration aborts if a client has zero or multiple coach assignments, or duplicate nonempty emails. Never infer an ambiguous owner.
3. Obtain Armin's explicit approval before executing any SQL, including staging SQL. Verify the SQL and grants with real JWTs for the head coach, coach B, their clients and a stranger. Mock tests do not prove live RLS correctness.
4. The new model allows one client record per nonempty email globally. Confirm this product constraint before release.
5. After approved migration validation and application, redeploy `send-invite`. It uses standard Supabase-provided `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`; no custom secret is added.
6. Require green PR CI and Armin's explicit merge approval. Merging main triggers the existing Pages deployment, so the DB and Edge changes must be ready first.
7. Run the real two-coach/client phone smoke test. Roll back the app before executing the SQL rollback (also requires approval).

## Remote delivery status

GitHub write access is verified with owner account `audiovido`. The feature branch is `feat/basic-pilot-independent-coaches`, created from the exact base above. The change is submitted for review without merging. PR CI is separate from the local validation above; inspect the current GitHub checks before approval. No SQL or deployment is authorized by the PR itself.
