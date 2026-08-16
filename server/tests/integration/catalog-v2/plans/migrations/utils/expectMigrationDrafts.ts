import { expect } from "bun:test";
import type { Migration, UpdateCatalogResponse } from "@autumn/shared";
import {
	collectCustomerPlanIds,
	collectPlanFilterPlanIds,
} from "@autumn/shared/api/products/utils/compare/planFiltersAreSame.js";
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
							plan.versions.length === expected.versions.length &&
							plan.versions.every(
								(version, index) => version === expected.versions[index],
							),
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
			const planIds = [
				...collectCustomerPlanIds({
					plan: migration.filter?.customer?.plan,
				}),
				...(migration.operations?.customer ?? []).flatMap((operation) =>
					collectPlanFilterPlanIds({
						planFilter:
							operation.type === "update_plan"
								? operation.plan_filter
								: undefined,
					}),
				),
			];
			return expectedDraft.planIds.every((planId) => planIds.includes(planId));
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
