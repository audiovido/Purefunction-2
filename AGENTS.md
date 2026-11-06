# AGENTS.md — Pure Function (read this first, every AI)

Owner: Armin (non-coder; answer him in **Persian script**, short and simple).
App: coaching PWA (like TrueCoach) for a coach in the US, up to ~100 clients. Coach uses iPad/laptop, clients use phones. Weight unit: **lb**.

## Links
- Repo: https://github.com/audiovido/Purefunction-2 (branch `main`)
- Live site: https://audiovido.github.io/Purefunction-2/ (auto-deploys from `main` only if `npm run lint` and `npm test` pass)
- Backend: Supabase project `pure-function-2` (ref `rugwzvztweiffprkxfdc`)
- Safe restore point: branch `backup/before-gemini-2026-10-27`

## Team roles
- **ChatGPT** = planner + reviewer. Talks with Armin, writes prompts for Gemini, reads the repo after each push and checks the diff.
- **Gemini (AI Studio)** = builder. Connected to the repo, pulls/pushes `main`. **Paused since 2026-11-01** (Armin's choice).
- **Claude** = lead + auditor. Clones the repo, applies ChatGPT's patch scripts on a branch, runs lint/test/build and the responsive check (`e2e/responsive-check.cjs`, must exit 0), opens the PR, and updates this file.
- While Gemini is paused, ChatGPT delivers changes as a **patch script** (exact find/replace, fail-closed, like `purefunction_responsive_pass.py`) based on the latest `main` SHA. Claude runs and verifies it. ChatGPT cannot push.

## Rules (all AIs)
1. One feature per Gemini prompt. Every prompt ends with: "npm run lint && npm test must pass, then push to main."
2. Don't change data logic when doing design work. Don't redraw the human body from scratch (BodyFigure is Gemini's; see `docs/BODY_FIGURE.md`).
3. **No horizontal scrolling anywhere**: no `overflow-x-auto` rows, no page side-scroll. Must work at 375px (phone), 768 and 1024px (iPad), and 1440px. Use wrapping, grids, selects, or bottom sheets instead. Grid children need `min-w-0`; use `grid-cols-1` explicitly.
4. Tap targets ≥ 44px. Input font ≥ 16px on phone. The phone bottom nav must not cover content.
5. **Database migrations need Armin's explicit OK.** Do not touch the old empty `messages` table (the live one is `coach_messages`).
6. After a big change, update the "Status" section below in the same push.
7. Show designs to Armin as a picture or mockup first, then build them.

## Code map
- Build: `npm install --legacy-peer-deps` · `npm run lint` (tsc) · `npm test` (vitest) · `npm run build`
- Demo mode: build without `VITE_SUPABASE_URL` → local sample clients (used for visual checks)
- Coach sidebar: Clients · Library · Programs · Messages (`src/App.tsx`)
- Client page `src/components/coach/ClientDetail.tsx`. Tabs: Exercises (Workout Builder + collapsed "Past workouts"; no sub-tabs) · Assessment (Overview / New assessment / Reports) · Notes · Goals · Progression · Nutrition
- Assessment Overview: `AssessmentSummary` → `SpectrumOfPatterns` → `BodyLab` (Body map + Movements) → `AssessmentHistory`
- Logic: `src/lib/spectrum.ts` (`clientFindings(client)` is the single source of findings: limited = below 90% of Full), `src/lib/bodyModel.ts`, figure in `src/components/BodyFigure.tsx`
- Client app: Today · Progress (Body map) · Chat · Refer
- Referrals: tables `referral_codes`, `referrals`, `credit_redemptions` (credit per invite is currently 0)
- Notes, Nutrition, Posture and spectrumTests live in `clients.data` JSON, so they need no migration.
- e2e: `e2e/cloud-flow.cjs` (mock Supabase); `e2e/responsive-check.cjs` (overflow crawler)

## Status (2026-11-01, night 2)
- Merged: responsive pass (#28), T0+T1 (#29).
- Merged #30 (ChatGPT pf_t2_t5.py, applied cleanly):
  - T2: e2e/cloud-flow.cjs updated. 52 checks pass (ALL PASSED).
  - T3: Program templates in Programs (save a week or 12 weeks, apply to several clients, logged days protected). Demo mode uses localStorage. Migration `supabase/migrations/20261101170000_pf2_program_templates.sql` was **applied on the live DB on 2026-11-01** (by Armin, with RLS and 3 policies; verified by Claude). Templates are live.
  - T4: unread badges on coach Messages and client Chat (uses the existing `coach_messages.read_at`; no migration).
  - T5: "+ Test Client" on Clients (labeled DEMO — NOT REAL; delete button; deleting it also deletes its workouts).
  - 79 tests pass; responsive-check 0/0; browser-checked templates and Test Client in demo mode.
- Done (Gemini, 2026-11-01): foreshortened poses in the non-natural views (hip flexion, SLR, shoulder flexion and others look right). Body map tags sit in gutters outside the body, with colored leader lines, sorted and non-overlapping (src/lib/labelLayout.ts). Gemini works in STRICT MODE: an allow-list of files, no push until Armin says "push", and Claude audits each push against a backup branch (latest: backup/before-gemini-2026-11-01).
- T7 (PR `feat/t7-licensed-media`, ChatGPT pf_t7.py + Claude fixes): every imported catalog video (1,221; YouTube/Vimeo from TrueCoach) is `unlicensed`. Clients never load them (checked: 0 iframes, 0 requests to YouTube/Vimeo; they see "Video coming soon" + cues). Coach setting "Show unlicensed videos": OFF in cloud, ON in demo. Library has a "No video yet" filter and a counter "0 of 1,221 have their own video". Coach can record or upload a 10–15 s clip (≤ 8 MB) into `exercise-videos` (license = own).
  - Still to decide: whether the catalog text and names copied from TrueCoach also need replacing; plan for the first 100 videos (T6: the coach records them on his phone).
- Cleanup (2026-11-01): removed duplicate controls before coach testing: the Exercises sub-tabs (the builder already has the exercise library; history is now a collapsed "Past workouts" section), and the extra "Record clip" button in the exercise editor (one picker; on phones it offers the camera or the library). Don't re-add duplicates.
- Open:
  1. (done 2026-11-01) Pose polish: Hip flexion in Side view now sits on the stool; Ankle in Side view keeps the arms down; tags keep ≥8px padding at 375px.
  2. Unread badges were not tested with two real signed-in devices.
  3. T6: plan for replacing the exercise videos (no code yet).

- PR `feat/t8a-weekly-calendar` (2026-11-04, ChatGPT pf_t8a_calendar_integrated.py + Claude fixes), NOT merged:
  - T8a: sign-up no longer auto-confirms; the Edge Function emails a one-time verify link (Resend), the app verifies `?verify=` before login. Needs: deploy `sign-up` Edge Function together with the site, Supabase Auth "Confirm email" ON, real-inbox test.
  - Weekly calendar in Exercises (7 cols desktop / 3 iPad / 1 phone), editor stays below. Not yet: skipped status, last-edited-by, side-panel editor.
  - Assessment tab label "Overview" → "Posture Overview" (label only).
  - Checks: lint OK, 91 tests, cloud-flow ALL PASSED, responsive 0/0, library + pwa PASSED.
  - Still open (security, T8b): private coach notes inside `clients.data` reach the client; client RLS can rewrite workouts and `clients.data`. SQL proposal not applied (needs Armin's OK).

- PR #34 `feat/t8b-security` (base #33): T8b security — secure notes table, results-only RPC, client data guard (photoUrl, nutrition.log, own manualRecords), trainer assignments. SQL `supabase/pending/NEEDS_ARMIN_OK_T8b_security.sql` NOT applied.
- PR #35 `feat/zip-a` (base #34): verify-email resend (3/hour), reliable saving (pending journal + version checks), not-measured ≠ 0, calendar slice 2 (week nav, Skipped, last editor, edit sheet, Copy to date). SQL `NEEDS_ARMIN_OK_signup_resend.sql` NOT applied (run after T8b SQL).
- Go-live order: Armin OK → Supabase "Confirm email" ON → backup → T8b SQL → resend SQL → merge #33, #34, #35 → deploy Edge Functions sign-up + reset-password → real two-device test.
- PR #36 `feat/zip-b` (base #35, 2026-11-04): ChatGPT ZIP B applied on 2329e60 + AGENTS.md merge.
  - p5 trainers (head coach = `private.settings.coach_email`; allowlist + per-client assign; Edge `invite-trainer`). p6 food text diary (USDA + server AI in Edge `food-parse`; photo disabled; coach 7-day summary). p7 static Posture Overview (draft pattern rules hidden from clients until Hamoon + a reviewer approve; coach-only secure reviews vs published frozen reports). p8 gait compare behind `VITE_ENABLE_GAIT_COMPARE` (OFF).
  - New features stay hidden until their SQL exists. SQL NOT applied: `NEEDS_ARMIN_OK_p5_trainers.sql` → `p6_food_diary` → `p7_posture` (each after T8b + resend SQL; rollbacks included).
  - Claude fixes: script git-status parsing bug; posture test (measured zero needs `measuredSides`); cloud-flow email locator.
  - Checks: tsc OK, 110 vitest, security-rest, cloud-flow, responsive 0/0, library, pwa all PASSED.
  - Before go-live: Edge secrets `OPENAI_API_KEY`, `OPENAI_FOOD_MODEL` (verify the model name), `USDA_API_KEY`; deploy `invite-trainer` + `food-parse` after their SQL.

## LIVE (2026-11-04 evening)
- Merged to main (`d9f22a7`): #33 T8a, #34 T8b security, #35 ZIP A, #36 ZIP B. Pages deploy OK.
- Live DB: Armin ran T8b → signup_resend → p5_trainers → p6_food_diary → p7_posture (all Success; dry-run + rollbacks tested first). Backup CSVs (clients/workouts/profiles) kept by Armin.
- Edge Functions deployed: sign-up, reset-password, invite-trainer, food-parse. Coach login + all clients checked by Armin.
- Still open: Edge secrets OPENAI_API_KEY / USDA_API_KEY / OPENAI_FOOD_MODEL (food diary is manual-only until set); client phone test with a real inbox; gait stays OFF; draft posture rules hidden until Hamoon + reviewer approve.

## Next ideas
- Auto joint detection on real photos (MediaPipe on phone) + photo analysis with green/red lines.
- Program templates for many clients; push notifications for new messages; a sample Test Client.

## Risks
- Exercise library videos belong to TrueCoach; replace them before commercial use.
- Coach and client editing the same workout day at the same time: the last save wins.
- The Spectrum of Patterns table is from Applied Integration Academy (credited under the table).

## Basic Pilot branch (2026-11-05; NOT released)
- Implemented the supplied CI-audited v3 package from exact `main` base `f8018ad` on `feat/basic-pilot-independent-coaches`. PR #37 is excluded.
- Basic is the default: coach Clients / Library / Messages, head-only Coaches; client Today / Chat; client detail Exercises / Notes. `VITE_FULL_FEATURES=true` keeps the heavy screens available.
- Added independent immutable client ownership SQL and rollback under `supabase/pending`. **Neither SQL file has been executed. Armin's explicit approval is required before SQL execution or merging.**
- Cloud client loading and pending-write replay mount only after the owner-column probe succeeds. Failure shows an unavailable-workspace message. `send-invite` uses caller RLS and checks the immutable owner.
- Corrected ZIP regressions: mock own-food deletion, responsive Assessment subview coverage; added missing-schema and revoked/unverified-coach cases and tests of the actual invite handler.
- Local validation and release requirements are recorded in `docs/BASIC_PILOT.md`. PR CI never deploys or executes SQL. Real staging SQL/JWT isolation remains unverified.
- Database source audit: corrected clients SELECT RLS for INSERT RETURNING, added existing-owner/head-coach eligibility preflight, and rejected NULL administration actions. SQL grammar parsed without execution. `docs/BASIC_PILOT_DB_REVIEW.md` defines a separate read-only preflight approval; no SQL execution or merge is authorized yet.
- GitHub write access verified with owner account `audiovido`; feature branch created from the exact base. Submit as a draft PR and keep merging/SQL behind Armin's explicit approval.

## Basic Pilot release and role-entry follow-up (2026-11-06)
- With Armin's explicit approval, PR #38 was merged as `3f4d60f`; Pages run 42168031599 succeeded. Ownership SQL is applied and `send-invite` v3 is active with JWT verification and owner-scoped reads.
- Before SQL, a restricted same-database rollback snapshot of affected client/assignment data and replaced functions/policies was verified. This is not an off-site disaster-recovery backup. Client content and assignments were preserved.
- 44 isolated PostgreSQL 17.5 checks cover migration/RLS/results/rollback; real production-role smoke tests of INSERT RETURNING, owner immutability, creator assignment, NULL action rejection and stranger isolation passed in a rolled-back transaction. Real inbox/two-device smoke tests remain outstanding.
- Follow-up `fix/strict-account-role-login`: password sign-in now requires the database profile to match the selected coach/client entry before any workspace mounts. Rejected sessions are locally signed out; slow auth/profile callbacks cannot bypass the check. Cloud workspaces always use the profile role and expose no Coach/Client preview switches. Preview switching stays in the account-free local demo for development checks.
- No SQL or Edge changes are needed for the role-entry follow-up.
- Armin then explicitly requested restoration and publication of the complete previous workspace together with strict role separation. PR #39 now includes production `VITE_FULL_FEATURES=true`: Assessment/Posture Overview, Body map, Movements, history/Reports, Goals, Progression, Nutrition, Programs and client Progress return using the existing components and records. Local Basic mode remains available for pilot checks.
- Ownership-schema checks apply to both Basic and full cloud modes before store loading/pending replay. Full mode never restores assignment transfers or coach/client preview switches for signed-in accounts. Gait remains OFF and draft posture-rule publication stays gated on the existing approvals.
- Extended cloud regression checks assessment measurements, movement rendering, frozen dated measurements, goal persistence, Progression and Reports. The full build also runs the two-coach and wrong-role-entry suite.

## Password recovery delivery diagnosis (2026-11-06)
- Production full workspace and role separation were released in PR #39 (`cdb5b29`), Pages run 42172496650 successful.
- A real recovery delivery check returned provider 403 `test_sender_restricted`. Project custom secrets include RESEND_API_KEY but no EMAIL_FROM; the shared sender therefore uses the Resend test domain. This requires provider account access and a verified sender/domain before recovery emails can reach general clients.
- Deployed `reset-password` v5 with privacy-safe operational diagnostics: fixed reason codes/status only, no email addresses, recovery links/tokens, API keys or raw provider errors. Public valid-email responses remain identical to prevent account enumeration. Seven real-handler tests plus the existing suite (126 total) and TypeScript passed.
- This diagnostic deployment does not fix provider verification. Keep the source change on its own PR; no SQL or password changes were executed. Never expose recovery tokens to work around email delivery. The user must enter their own new password after receiving the verified recovery email.
