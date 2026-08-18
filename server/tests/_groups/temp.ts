import type { TestGroup } from "./types";

// Version-repoint suite — 99/100 green as of run 2026-08-18 (/tmp/vr-run2.log),
// up from 65/100. The single remaining failure is a REAL implementation gap
// awaiting a product decision, not a test bug:
//
//   ✗ "a changed child routes per-customer and lands the full transition"
//
//   When a parent version bump carries a NEW child (seat) product version, the
//   batch lane moves the seat ENTITLEMENT definitions onto the target child
//   (allowance 100 → 150) but leaves customer_products.internal_product_id on
//   the seat assignments — and customer_licenses.license_internal_product_id on
//   the pool — pointing at child v1. Stale product pointers under a pool whose
//   link now points at child v2. The per-customer lane is worse: seats keep
//   child v1's entitlements entirely and never pick up the new link.
//
//   Neither lane implements what the test asserts, so it is left failing
//   deliberately rather than weakened. Resolving it needs one of:
//     (a) extend the batch seat-assignment repoint (repointCustomerProductRows
//         already exists) plus the pool's denormalized column, or
//     (b) teach the guard to reject when a customer's pool sits on a retired
//         link bound to a different child version — needs catalog state the
//         pure compute step does not read today.
//
// Note: batch-lane WEBHOOK tests need the worktree's trigger branch exported,
// or the task lands on `default` and the local worker never picks it up:
//   TRIGGER_DEV_BRANCH=johnyeocx-wt24-charlie-batch-plan-item-delete bun test …
const activeTempPaths: string[] = [
	"integration/billing/migrations-v2/batch-migrations/version-repoint/licenses/license-repoint-continuity.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Version-repoint: one open license seat-repoint gap",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
