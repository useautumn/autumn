import type { Migration } from "@autumn/shared";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type {
	MigrationUpdatePlanCustomize,
	UpdatePlanOp,
} from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";

export type MigrationClient = {
	migrationsV2: {
		deleteAndCreate: (params: {
			id: string;
			filter?: MigrationFilter | null;
			operations?: Operations | null;
		}) => Promise<Migration>;
		update: (params: {
			id: string;
			updates: { operations?: Operations | null };
		}) => Promise<Migration>;
	};
};

export const createMigration = async ({
	migrationClient,
	id,
	filter = { customer: { plan: { plan_id: "pro" } } },
	operations,
}: {
	migrationClient: MigrationClient;
	id: string;
	filter?: MigrationFilter | null;
	operations: Operations;
}) =>
	migrationClient.migrationsV2.deleteAndCreate({
		id,
		filter,
		operations,
	});

export const updateMigrationOperations = ({
	migrationClient,
	id,
	operations,
}: {
	migrationClient: MigrationClient;
	id: string;
	operations: Operations;
}) =>
	migrationClient.migrationsV2.update({
		id,
		updates: { operations },
	});

export const buildUpdatePlanOperations = ({
	customize,
	planId = "pro",
	secondCustomize,
	secondPlanId = "premium",
}: {
	customize: MigrationUpdatePlanCustomize;
	planId?: string;
	secondCustomize?: MigrationUpdatePlanCustomize;
	secondPlanId?: string;
}): Operations => ({
	customer: [
		{
			type: "update_plan",
			plan_filter: { plan_id: planId },
			customize,
		},
		...(secondCustomize
			? [
					{
						type: "update_plan",
						plan_filter: { plan_id: secondPlanId },
						customize: secondCustomize,
					} satisfies UpdatePlanOp,
				]
			: []),
	],
});
