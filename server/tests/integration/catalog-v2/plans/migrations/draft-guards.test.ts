/**
 * catalogV2.update — migration draft guards: include_custom, previous_price,
 * billing changes, and one draft across all requesting plans.
 *
 * The custom guard must thread to BOTH the migration filter and every
 * update_plan op's plan_filter — a customer holding a custom copy of the
 * plan must be excluded (or included) consistently at each level.
 */

import { expect, test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	deleteMigrations,
	expectMigrationDraftsCorrect,
	expectUpdateMigrations,
} from "./utils/expectMigrationDrafts.js";
import { seedVersionableCustomer } from "./utils/seedVersionableCustomer.js";

const messagesItem = ({ included }: { included: number }) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const monthPrice = ({ amount }: { amount: number }) => ({
	amount,
	interval: BillingInterval.Month,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: include_custom true omits custom:false guards")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_ic");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Custom Guard",
						items: [messagesItem({ included: 100 })],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [messagesItem({ included: 500 })],
						migration: { draft: true, include_custom: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [1] }]],
			});

			const migrations = await migrationRepo.get({
				ctx,
				id: response.migrations![0]!.id,
			});
			expect(migrations[0]?.filter).toEqual({
				customer: { plan: { plan_id: planId, version: 1 } },
			});
			const [operation] = migrations[0]?.operations?.customer ?? [];
			expect(operation?.type).toBe("update_plan");
			if (operation?.type === "update_plan") {
				expect(operation.plan_filter).toEqual({
					plan_id: planId,
					version: 1,
				});
			}

			await deleteMigrations({
				ctx,
				ids: [response.migrations![0]!.id],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

const seedTwoVersionsWithCustomCustomer = async ({
	autumn,
	ctx,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "V1",
				items: [messagesItem({ included: 100 })],
			},
		],
	});
	// Differing v2 shape so all_versions produces two buckets (two ops).
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				version: 2,
				name: "V2",
				items: [
					messagesItem({ included: 200 }),
					{ feature_id: TestFeature.Dashboard },
				],
			},
		],
	});
	await seedVersionableCustomer({ ctx, planId, version: 1 });
	await seedVersionableCustomer({ ctx, planId, version: 1, isCustom: true });
	await seedVersionableCustomer({ ctx, planId, version: 2 });
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: custom:false threads to the migration filter and every update_plan op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_cg");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedTwoVersionsWithCustomCustomer({
				autumn: autumnV2_3,
				ctx,
				planId,
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "all_versions",
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [1, 2] }]],
			});

			const [migration] = await migrationRepo.get({
				ctx,
				id: response.migrations![0]!.id,
			});
			expect(migration?.filter).toEqual({
				customer: { plan: { plan_id: planId, custom: false } },
			});

			const operations = migration?.operations?.customer ?? [];
			expect(operations).toHaveLength(2);
			for (const [index, operation] of operations.entries()) {
				expect(operation.type).toBe("update_plan");
				if (operation.type === "update_plan") {
					expect(operation.plan_filter).toEqual({
						plan_id: planId,
						version: index + 1,
						custom: false,
					});
				}
			}

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: include_custom true omits the guard from the filter and every op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_cgi");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedTwoVersionsWithCustomCustomer({
				autumn: autumnV2_3,
				ctx,
				planId,
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "all_versions",
						items: [messagesItem({ included: 500 })],
						migration: { draft: true, include_custom: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [1, 2] }]],
			});

			const [migration] = await migrationRepo.get({
				ctx,
				id: response.migrations![0]!.id,
			});
			expect(migration?.filter).toEqual({
				customer: { plan: { plan_id: planId } },
			});

			const operations = migration?.operations?.customer ?? [];
			expect(operations).toHaveLength(2);
			for (const [index, operation] of operations.entries()) {
				expect(operation.type).toBe("update_plan");
				if (operation.type === "update_plan") {
					expect(operation.plan_filter).toEqual({
						plan_id: planId,
						version: index + 1,
					});
				}
			}
			// No `custom` guard anywhere in the persisted draft.
			expect(
				JSON.stringify({
					filter: migration?.filter,
					operations: migration?.operations,
				}),
			).not.toContain('"custom":');

			await deleteMigrations({ ctx, ids: [response.migrations![0]!.id] });
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: price change stamps previous_price and no_billing_changes false")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_price");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Priced",
						price: monthPrice({ amount: 20 }),
						items: [messagesItem({ included: 100 })],
					},
				],
			});
			await seedVersionableCustomer({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						price: monthPrice({ amount: 30 }),
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [1] }]],
			});

			expectMigrationDraftsCorrect({
				migrations: await migrationRepo.get({
					ctx,
					id: response.migrations![0]!.id,
				}),
				expected: [
					{
						planIds: [planId],
						noBillingChanges: false,
						filter: {
							customer: {
								plan: { plan_id: planId, version: 1, custom: false },
							},
						},
						operations: [
							{
								type: "update_plan",
								plan_filter: {
									plan_id: planId,
									version: 1,
									custom: false,
								},
								customize: {
									price: monthPrice({ amount: 30 }),
									previous_price: monthPrice({ amount: 20 }),
								},
							},
						],
					},
				],
			});

			await deleteMigrations({
				ctx,
				ids: [response.migrations![0]!.id],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: two plans requesting drafts yield one draft with $or")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const guarded = uniqueTestId("cv2_mig_two_a");
		const unguarded = uniqueTestId("cv2_mig_two_b");
		const planIds = [guarded, unguarded];
		await deleteDbPlans({ ctx, planIds });
		try {
			for (const planId of planIds) {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: planId,
							items: [messagesItem({ included: 100 })],
						},
					],
				});
				await seedVersionableCustomer({ ctx, planId, version: 1 });
			}

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: guarded,
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
					{
						plan_id: unguarded,
						items: [messagesItem({ included: 500 })],
						migration: { draft: true, include_custom: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [
					[
						{ plan_id: guarded, versions: [1] },
						{ plan_id: unguarded, versions: [1] },
					],
				],
			});

			const [migration] = await migrationRepo.get({
				ctx,
				id: response.migrations![0]!.id,
			});
			expect(migration?.filter).toEqual({
				customer: {
					plan: {
						$or: [
							{ plan_id: guarded, version: 1 },
							{ plan_id: unguarded, version: 1 },
						].sort((left, right) =>
							left.plan_id.localeCompare(right.plan_id),
						),
					},
				},
			});
			const operations = migration?.operations?.customer ?? [];
			expect(operations).toHaveLength(2);
			const planFilters = operations
				.filter((operation) => operation.type === "update_plan")
				.map((operation) => operation.plan_filter)
				.sort((left, right) =>
					String(left.plan_id).localeCompare(String(right.plan_id)),
				);
			expect(planFilters).toEqual(
				[
					{ plan_id: guarded, version: 1, custom: false },
					{ plan_id: unguarded, version: 1 },
				].sort((left, right) => left.plan_id.localeCompare(right.plan_id)),
			);

			await deleteMigrations({
				ctx,
				ids: (response.migrations ?? []).map((migration) => migration.id),
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
