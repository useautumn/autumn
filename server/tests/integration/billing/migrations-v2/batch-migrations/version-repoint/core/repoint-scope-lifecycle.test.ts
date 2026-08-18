import { expect, test } from "bun:test";
import { CusProductStatus, customerProducts } from "@autumn/shared";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	readCustomerPlanRows,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

/** products.base creates through the V1 route, which silently drops V2 item
 * fields; /plans.update mints versions through the V2 route. */
const catalogItems = [items.monthlyMessages({ includedUsage: 100 })];
const versionItems = [itemsV2.monthlyMessages({ included: 100 })];

const createVersionTwo = async ({
	autumnV2_3,
	planId,
	items: nextItems = versionItems,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
	items?: unknown[];
}) =>
	autumnV2_3.post("/plans.update", {
		plan_id: planId,
		force_version: true,
		items: nextItems,
	});

const versionOperation = ({ planFilter }: { planFilter: PlanFilter }) => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: planFilter,
			version: 2,
		},
	],
});

const readLifecycleFields = async ({
	ctx,
	customerProductId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerProductId: string;
}) => {
	const [row] = await ctx.db
		.select({
			canceled: customerProducts.canceled,
			accessStartsAt: customerProducts.access_starts_at,
			billingCycleAnchorResetsAt:
				customerProducts.billing_cycle_anchor_resets_at,
			quantity: customerProducts.quantity,
			processor: customerProducts.processor,
			onTrialEnd: customerProducts.on_trial_end,
		})
		.from(customerProducts)
		.where(eq(customerProducts.id, customerProductId));
	return row;
};

test.concurrent(
	`${chalk.yellowBright("batch version repoint: preserves every migratable lifecycle row in place")}`,
	async () => {
		const prefix = "repoint-lifecycle";
		const lifecycleCases: {
			key: string;
			status: CusProductStatus;
			canceled?: boolean;
			trial?: boolean;
		}[] = [
			{ key: "active", status: CusProductStatus.Active },
			{ key: "past-due", status: CusProductStatus.PastDue },
			{ key: "paused", status: CusProductStatus.Paused },
			{ key: "scheduled", status: CusProductStatus.Scheduled },
			{ key: "canceling", status: CusProductStatus.Active, canceled: true },
			{ key: "trial", status: CusProductStatus.Active, trial: true },
		];
		const customerIds = lifecycleCases.map(
			({ key }) => `${prefix}-${key}-customer`,
		);
		const plan = products.base({ id: `${prefix}-plan`, items: catalogItems });
		const { autumnV2_3, ctx } = await initScenario({
			customerId: customerIds[0],
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers(customerIds.slice(1).map((id) => ({ id }))),
				s.products({ list: [plan] }),
			],
			actions: [],
		});

		for (const customerId of customerIds) {
			await autumnV2_3.billing.attach({
				customer_id: customerId,
				plan_id: plan.id,
			});
		}

		const beforeByCustomer = new Map(
			await Promise.all(
				lifecycleCases.map(async (lifecycle, index) => {
					const customerId = customerIds[index];
					const before = await readRepointableCustomerPlanRow({
						ctx,
						customerId,
						planId: plan.id,
					});
					const marker = 1_800_000_000_000 + index * 10_000;
					await ctx.db
						.update(customerProducts)
						.set({
							status: lifecycle.status,
							canceled: lifecycle.canceled ?? false,
							starts_at: marker + 1,
							access_starts_at: marker + 2,
							canceled_at: lifecycle.canceled ? marker + 3 : null,
							ended_at: lifecycle.canceled ? marker + 4 : null,
							trial_ends_at: lifecycle.trial ? marker + 5 : null,
							billing_cycle_anchor: marker + 6,
							billing_cycle_anchor_resets_at: marker + 7,
							subscription_ids: [`sub_${lifecycle.key}`],
							scheduled_ids: [`sched_${lifecycle.key}`],
							options: [
								{ feature_id: TestFeature.Messages, quantity: index + 2 },
							],
							quantity: index + 2,
							processor: { type: "stripe", id: `proc_${lifecycle.key}` },
							on_trial_end: lifecycle.trial ? "cancel" : null,
						})
						.where(eq(customerProducts.id, before.id));
					return [
						customerId,
						await readRepointableCustomerPlanRow({
							ctx,
							customerId,
							planId: plan.id,
						}),
					] as const;
				}),
			),
		);
		const lifecycleBefore = new Map(
			await Promise.all(
				[...beforeByCustomer].map(
					async ([customerId, row]) =>
						[
							customerId,
							await readLifecycleFields({
								ctx,
								customerProductId: row.id,
							}),
						] as const,
				),
			),
		);

		await createVersionTwo({ autumnV2_3, planId: plan.id });
		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: { customer: { customer_id: { $in: customerIds } } },
			operations: versionOperation({
				planFilter: { plan_id: plan.id, custom: false },
			}),
		});
		expectBatchLane({ result });

		for (const customerId of customerIds) {
			const before = beforeByCustomer.get(customerId);
			if (!before) throw new Error(`Missing before row for ${customerId}`);
			const expectedLifecycle = lifecycleBefore.get(customerId);
			if (!expectedLifecycle) {
				throw new Error(`Missing lifecycle snapshot for ${customerId}`);
			}
			const after = await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			});
			expectCustomerPlanRepointedInPlace({
				before,
				after,
				targetVersion: 2,
			});
			expect(
				await readLifecycleFields({
					ctx,
					customerProductId: after.id,
				}),
			).toEqual(expectedLifecycle);
		}
	},
);

const customScopeCases = [
	{ key: "false", custom: false, plainMoves: true, customMoves: false },
	{ key: "true", custom: true, plainMoves: false, customMoves: true },
	{ key: "omitted", custom: undefined, plainMoves: true, customMoves: false },
] as const;

for (const scopeCase of customScopeCases) {
	test.concurrent(
		`${chalk.yellowBright(`batch version repoint: custom ${scopeCase.key} follows preprocessing row scope`)}`,
		async () => {
			const prefix = `repoint-custom-${scopeCase.key}`;
			const plainId = `${prefix}-plain`;
			const customId = `${prefix}-custom`;
			const plan = products.base({ id: `${prefix}-plan`, items: catalogItems });
			const { autumnV2_3, ctx } = await initScenario({
				customerId: plainId,
				setup: [
					s.customer({ testClock: false }),
					s.otherCustomers([{ id: customId }]),
					s.products({ list: [plan] }),
				],
				actions: [],
			});
			await autumnV2_3.billing.attach({
				customer_id: plainId,
				plan_id: plan.id,
			});
			await autumnV2_3.billing.attach({
				customer_id: customId,
				plan_id: plan.id,
				customize: { items: [itemsV2.monthlyMessages({ included: 125 })] },
			});
			const plainBefore = await readRepointableCustomerPlanRow({
				ctx,
				customerId: plainId,
				planId: plan.id,
			});
			const customBefore = await readRepointableCustomerPlanRow({
				ctx,
				customerId: customId,
				planId: plan.id,
			});

			await createVersionTwo({ autumnV2_3, planId: plan.id });
			const planFilter: PlanFilter =
				scopeCase.custom === undefined
					? { plan_id: plan.id }
					: { plan_id: plan.id, custom: scopeCase.custom };
			const { result } = await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${prefix}-migration`,
				filter: { customer: { plan: planFilter } },
				operations: versionOperation({ planFilter }),
			});
			expectBatchLane({ result });

			for (const [customerId, before, shouldMove] of [
				[plainId, plainBefore, scopeCase.plainMoves],
				[customId, customBefore, scopeCase.customMoves],
			] as const) {
				const [after] = await readCustomerPlanRows({
					ctx,
					customerId,
					planId: plan.id,
				});
				expect(after.id).toBe(before.id);
				expect(after.version).toBe(shouldMove ? 2 : 1);
				expect(after.internalProductId === before.internalProductId).toBe(
					!shouldMove,
				);
			}
		},
	);
}

test.concurrent(
	`${chalk.yellowBright("batch version repoint: explicit customer selection opts a customized row in")}`,
	async () => {
		const prefix = "repoint-explicit-custom";
		const customerId = `${prefix}-customer`;
		const plan = products.base({ id: `${prefix}-plan`, items: catalogItems });
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
			customize: { items: [itemsV2.monthlyMessages({ included: 125 })] },
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(before.isCustom).toBe(true);

		await createVersionTwo({ autumnV2_3, planId: plan.id });
		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: { customer: { customer_id: customerId } },
			operations: versionOperation({ planFilter: { plan_id: plan.id } }),
		});
		expectBatchLane({ result });
		expectCustomerPlanRepointedInPlace({
			before,
			after: await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			}),
			targetVersion: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch version repoint: an itemless plan repoints successfully")}`,
	async () => {
		const prefix = "repoint-empty-plan";
		const customerId = `${prefix}-customer`;
		const plan = products.base({ id: `${prefix}-plan`, items: [] });
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		await createVersionTwo({
			autumnV2_3,
			planId: plan.id,
			items: [],
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${prefix}-migration`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: versionOperation({
				planFilter: { plan_id: plan.id, custom: false },
			}),
		});
		expectBatchLane({ result });
		expectCustomerPlanRepointedInPlace({
			before,
			after: await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			}),
			targetVersion: 2,
		});
	},
);
