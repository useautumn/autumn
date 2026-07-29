import { expect } from "bun:test";
import type { Migration } from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";

type ExpectedDraft = {
	filter: MigrationFilter;
	noBillingChanges?: boolean;
	operation: UpdatePlanOp;
	planIds: string[];
};

const mentionsEveryPlan = ({
	migration,
	planIds,
}: {
	migration: Migration;
	planIds: string[];
}) => {
	const serialized = JSON.stringify({
		filter: migration.filter,
		operations: migration.operations,
	});
	return planIds.every((planId) => serialized.includes(planId));
};

export const expectMigrationDrafts = ({
	expected,
	migrations,
}: {
	expected: ExpectedDraft[];
	migrations: Migration[];
}) => {
	const remaining = [...migrations];

	for (const expectedDraft of expected) {
		const index = remaining.findIndex((migration) =>
			mentionsEveryPlan({ migration, planIds: expectedDraft.planIds }),
		);
		expect(index).toBeGreaterThanOrEqual(0);

		const [migration] = remaining.splice(index, 1);
		const operations = migration.operations?.customer ?? [];

		expect(migration.filter).toEqual(expectedDraft.filter);
		if (expectedDraft.noBillingChanges !== undefined) {
			expect(migration.no_billing_changes).toBe(expectedDraft.noBillingChanges);
		}
		expect(operations).toHaveLength(1);
		expect(operations[0]).toEqual(expectedDraft.operation);
		expect(operations[0]).not.toHaveProperty("version");
	}
};
