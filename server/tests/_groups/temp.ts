import type { TestGroup } from "./types";

const activeTempPaths: string[] = [
	"integration/billing/migrations-v2/batch-migrations/licenses/batch-license-customize-priced-base-item.test.ts",
	"integration/billing/migrations-v2/batch-migrations/licenses/batch-license-released-seat-pool-repoint.test.ts",
	"integration/billing/migrations-v2/batch-migrations/licenses/list-distinct-license-entitlements-for-page.test.ts",
	"integration/billing/migrations-v2/batch-migrations/licenses/batch-license-over-allocated-pool.test.ts",
	"integration/billing/migrations-v2/batch-migrations/replace-items/batch-replace-item-events-webhooks.test.ts",
	"integration/billing/migrations-v2/batch-migrations/remove-items/batch-delete-item-events-webhooks.test.ts",
	"integration/billing/migrations-v2/batch-migrations/version-repoint/events/version-repoint-webhooks-cache.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "Remaining batch-migration integration failures",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
