/**
 * Higher-level migration business logic (preview, run, idempotency,
 * billing-path bridging). Empty in phase 1 — phase 1 is pure CRUD on the
 * migration entity, handled directly via `migrationRepo`. Phase 2+ adds
 * verbs here as ops grow runtime semantics.
 */
export const migrationActions = {} as const;
