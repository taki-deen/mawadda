# Project brief: Mawadda

## Current status
Working static Arabic RTL prototype, exported 2026-11-11. This package is prepared for Codex; it does not itself register a project in the Codex UI or create a GitHub repository.

## Product
Help two adults considering marriage discuss values, responsibilities, family, finances and future expectations. Preserve the 150 questions across 15 categories and the warm ivory/sage design.

## Implemented
Two local respondent profiles, optional choices, free text, importance, deferral and discussion flags; local autosave; import/export; manual discussion review; weighted descriptive score; category filters; print dialog.

## Scoring
Matching eligible choices score 1; different choices score 0. Manual review overrides with 1, 0.5 or 0. Weight is max of both importance values (1–3). Incomplete, deferred and unreviewed free-text answers are excluded. Sensitive disclosure questions are not automatically matched. This is not a validated psychological assessment.

## State
localStorage key mawadda-v1, schema version 1. names[2], answers[2] keyed by question id, reviews, position[2], updated. An answer contains choice, text, importance, skip, flag. A review contains status and note. Changes to an answer currently delete its entire review including the agreement note; consider preserving notes and marking them stale in a future improvement.

## Proposed roadmap — not implemented or approved for automatic rollout
1. Separate UI, storage, validation and scoring modules; improve tests and accessibility.
2. React + TypeScript frontend; Node.js + Express backend; PostgreSQL with Prisma.
3. Managed auth, two-member sessions, expiring invitations, server-side sharing consent and cross-device saving.
4. Question versioning, independent answer ownership, jointly approved reviews and versioned report snapshots.
5. Payment and launch only after real-user pilot, security review and qualified content review.

## Proposed data model
users; couple_sessions; session_members; invitations; questionnaire_versions; categories; questions; question_options; answers; answer_selections; sharing_consents; discussion_reviews; report_snapshots; audit_events.
Enforce one answer per session/user/question, membership checks and sharing consent before disclosing partner responses. Do not log sensitive answer contents. A changed answer invalidates its review. Downloaded reports cannot be remotely revoked.

## Verification
npm test: unique question count, missing answers, sensitive exclusion, manual override, weights, import validation and HTML escaping.
npm run check: JavaScript syntax.
Previous browser QA: desktop layout, choice selection, switching profiles, persistence after reload, automatic and manual scoring. Mobile and import/export round trips need fuller browser testing before production claims.

## Next task suggested
Review this baseline, run existing tests, report bugs and propose a bounded refactor before starting the commercial architecture. Do not claim unimplemented auth, cloud database, security certification, or clinical validity.
