import type { TestGroup } from "../types";

/**
 * Curated catalog-v2 coverage: one mainline + one hardest-invariant file per
 * area, favoring execute-path and matrix files. Full corpus stays in `all`.
 */
export const coreCatalog: TestGroup = {
	name: "core-catalog",
	description:
		"Essential catalogV2 coverage: create/update, Stripe reuse, versions, licenses, variants, migrations",
	tier: "core",
	paths: [
		// ── Features ──
		"integration/catalog-v2/features/same-call-ordering.test.ts",
		"integration/catalog-v2/features/update/update-feature-rewrites-leakage.test.ts",

		// ── Create ──
		"integration/catalog-v2/plans/create/create-plans.test.ts",
		"integration/catalog-v2/plans/create/create-plan-items-priced.test.ts",

		// ── Update ──
		"integration/catalog-v2/plans/update/idempotent-plans.test.ts",
		"integration/catalog-v2/plans/update/update-plan-rows.test.ts",
		"integration/catalog-v2/plans/update/update-plan-items.test.ts",
		"integration/catalog-v2/plans/update/update-plan-free-trial.test.ts",

		// ── Stripe resources ──
		"integration/catalog-v2/plans/create/stripe-init.test.ts",
		"integration/catalog-v2/plans/update/stripe-reuse.test.ts",
		"integration/catalog-v2/plans/update/stripe-reuse-mint.test.ts",
		"integration/catalog-v2/plans/update/stripe-price-immutability.test.ts",
		"integration/catalog-v2/plans/variants/stripe-carry.test.ts",
		"integration/catalog-v2/plans/licenses/stripe-carry.test.ts",

		// ── Versions ──
		"integration/catalog-v2/plans/versions/new-version-mint.test.ts",
		"integration/catalog-v2/plans/versions/all-versions-items.test.ts",
		"integration/catalog-v2/plans/versions/mixed-versioning-strategies.test.ts",
		"integration/catalog-v2/plans/versions/default-version-attach.test.ts",

		// ── Batch / interplay ──
		"integration/catalog-v2/plans/batch/batch-ops.test.ts",
		"integration/catalog-v2/plans/batch/features-plans-resolution.test.ts",

		// ── Validation ──
		"integration/catalog-v2/plans/validation/plan-errors.test.ts",
		"integration/catalog-v2/plans/validation/default-flag.test.ts",

		// ── Preview ──
		"integration/catalog-v2/plans/preview/preview-actions.test.ts",
		"integration/catalog-v2/plans/preview/changes/changes-mixed.test.ts",
		"integration/catalog-v2/plans/preview/preview-state-versioning.test.ts",

		// ── Migration drafts ──
		"integration/catalog-v2/plans/migrations/versioning-drafts.test.ts",
		"integration/catalog-v2/plans/migrations/licenses/run/run-license-drafts.test.ts",

		// ── Licenses ──
		"integration/catalog-v2/plans/licenses/declared/create-and-update.test.ts",
		"integration/catalog-v2/plans/licenses/pinned/pin-freeze-items.test.ts",
		"integration/catalog-v2/plans/licenses/propagated/follow-new-parent-version.test.ts",
		"integration/catalog-v2/plans/licenses/mix/compose-parent-plans.test.ts",

		// ── Variants ──
		"integration/catalog-v2/plans/variants/create/create-variant.test.ts",
		"integration/catalog-v2/plans/variants/follow/follow.test.ts",
		"integration/catalog-v2/plans/variants/customize/items-put.test.ts",
		"integration/catalog-v2/plans/variants/pointer/pointer-on-base-mint.test.ts",

		// ── Remove ──
		"integration/catalog-v2/plans/remove/remove-plans.test.ts",
	],
};
