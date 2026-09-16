import type { TestGroup } from "../types";

export const coreMigrations: TestGroup = {
	name: "core-migrations",
	description: "Core migration tests",
	tier: "core",
	paths: [
		"migrations/migrate-free.test.ts",
		"migrations/migrate-paid.test.ts",
		"migrations/migrate-trials.test.ts",
		"migrations/migrate-states.test.ts",
		"integration/billing/migrations-v2/update-plan-operation/customize/update-plan-op-price.test.ts",
		"integration/billing/migrations-v2/update-plan-operation/customize/update-plan-op-scheduled-patch.test.ts",
		"integration/billing/migrations-v2/trial/migration-paid-recurring-trial-carryover.test.ts",
		"integration/billing/migrations-v2/update-plan-version/migration-free-trial-carryover.test.ts",
		"integration/billing/migrations-v2/one-off-prepaid-preserve/preserve-on-migration.test.ts",
		"integration/billing/migrations-v2/update-plan-operation/state-preservation/subscriptions/update-plan-op-states.test.ts",
		// Batch-lane contract: core operations, parity, lifecycle, and fallbacks.
		"integration/billing/migrations-v2/batch-migrations/add-items/batch-add-items.test.ts",
		"integration/billing/migrations-v2/batch-migrations/remove-items/batch-delete-item.test.ts",
		"integration/billing/migrations-v2/batch-migrations/replace-items/batch-replace-item.test.ts",
		"integration/billing/migrations-v2/batch-migrations/mixed-items/batch-mixed-item-operations.test.ts",
		"integration/billing/migrations-v2/batch-migrations/batch-lane-parity.test.ts",
		"integration/billing/migrations-v2/batch-migrations/replace-items/batch-replace-item-cycle-anchors.test.ts",
		"integration/billing/migrations-v2/batch-migrations/licenses/batch-license-item-edit.test.ts",
		"integration/billing/migrations-v2/batch-migrations/replace-items/batch-replace-item-events-webhooks.test.ts",
		"integration/billing/migrations-v2/batch-migrations/version-repoint/core/basic-version-repoint.test.ts",
		"integration/billing/migrations-v2/batch-migrations/version-repoint/core/version-repoint-customize.test.ts",
		"integration/billing/migrations-v2/batch-migrations/version-repoint/core/repoint-scope-lifecycle.test.ts",
		"integration/billing/migrations-v2/batch-migrations/version-repoint/fallbacks/operation-input-fallbacks.test.ts",
	],
};
