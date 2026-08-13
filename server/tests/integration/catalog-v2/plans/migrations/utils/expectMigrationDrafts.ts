import { expect } from "bun:test";
import type { Migration, UpdateCatalogResponse } from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

type ExpectedDraft = {
	filter: MigrationFilter;
	noBillingChanges?: boolean;
	operations: UpdatePlanOp[];
	planIds: string[];
};

export const expectUpdateMigrations = ({
	response,
	plans,
}: {
	response: UpdateCatalogResponse;
	plans: { plan_id: string; versions: number[] }[][];
}) => {
	expect(response.migrations ?? []).toHaveLength(plans.length);
	for (const expectedPlans of plans) {
		const entry = response.migrations?.find(
			(migration) =>
				migration.plans.length === expectedPlans.length &&
				expectedPlans.every((expected) =>
					migration.plans.some(
						(plan) =>
							plan.plan_id === expected.plan_id &&
							JSON.stringify(plan.versions) ===
								JSON.stringify(expected.versions),
					),
				),
		);
		expect(
			entry,
			`missing migration result for ${expectedPlans.map((plan) => plan.plan_id).join(",")}`,
		).toBeDefined();
	}
};

export const expectMigrationDraftsCorrect = ({
	expected,
	migrations,
}: {
	expected: ExpectedDraft[];
	migrations: Migration[];
}) => {
	expect(migrations).toHaveLength(expected.length);

	const remaining = [...migrations];
	for (const expectedDraft of expected) {
		const index = remaining.findIndex((migration) => {
			const serialized = JSON.stringify({
				filter: migration.filter,
				operations: migration.operations,
			});
			return expectedDraft.planIds.every((planId) =>
				serialized.includes(planId),
			);
		});
		expect(index).toBeGreaterThanOrEqual(0);

		const [migration] = remaining.splice(index, 1);
		const operations = migration.operations?.customer ?? [];

		expect(migration.filter).toEqual(expectedDraft.filter);
		if (expectedDraft.noBillingChanges !== undefined) {
			expect(migration.no_billing_changes).toBe(expectedDraft.noBillingChanges);
		}
		expect(operations).toHaveLength(expectedDraft.operations.length);
		expect(operations).toEqual(expectedDraft.operations);
		for (const operation of operations) {
			expect(operation).not.toHaveProperty("version");
		}
	}
};

export const deleteMigrations = async ({
	ctx,
	ids,
}: {
	ctx: AutumnContext;
	ids: string[];
}) => {
	for (const id of ids) {
		await migrationRepo.delete({ ctx, id }).catch(() => null);
	}
};
