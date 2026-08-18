import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	expectPerCustomerLaneWithRejections,
	readCustomerPlanRows,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

// Plan versions accumulate across runs, so every test mints its own plan id to
// keep version-number assertions deterministic.
const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

const expectRepoint = async ({
	ctx,
	customerId,
	planId,
	before,
	targetVersion,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	planId: string;
	before: Awaited<ReturnType<typeof readRepointableCustomerPlanRow>>;
	targetVersion: number;
}) => {
	const after = await readRepointableCustomerPlanRow({
		ctx,
		customerId,
		planId,
	});
	expectCustomerPlanRepointedInPlace({ before, after, targetVersion });
	expect(await readCustomerPlanRows({ ctx, customerId, planId })).toHaveLength(
		1,
	);
};

test.concurrent(
	`${chalk.yellowBright("batch version repoint: v1 and v2 customers fan into v3")}`,
	async () => {
		const stem = uniqueStem("bvr-multi-fan");
		const v1CustomerId = `${stem}-v1-customer`;
		const v2CustomerId = `${stem}-v2-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId: v1CustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: v2CustomerId }]),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		await autumnV2_3.billing.attach({
			customer_id: v2CustomerId,
			plan_id: plan.id,
			version: 2,
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 300 })],
		});
		const before = new Map(
			await Promise.all(
				[v1CustomerId, v2CustomerId].map(
					async (customerId) =>
						[
							customerId,
							await readRepointableCustomerPlanRow({
								ctx,
								customerId,
								planId: plan.id,
							}),
						] as const,
				),
			),
		);

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: {
				customer: {
					plan: { plan_id: plan.id, version: { $in: [1, 2] } },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: {
							plan_id: plan.id,
							version: { $in: [1, 2] },
						},
						version: 3,
					},
				],
			},
		});

		expectBatchLane({ result });
		for (const customerId of [v1CustomerId, v2CustomerId]) {
			await expectRepoint({
				ctx,
				customerId,
				planId: plan.id,
				before: before.get(customerId)!,
				targetVersion: 3,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("batch version repoint: one disjoint-plan operation resolves each plan's own target")}`,
	async () => {
		const stem = uniqueStem("bvr-multi-disjoint");
		const firstCustomerId = `${stem}-first-customer`;
		const secondCustomerId = `${stem}-second-customer`;
		const firstPlan = products.base({
			id: `${stem}-first-plan`,
			group: `${stem}-first-group`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const secondPlan = products.base({
			id: `${stem}-second-plan`,
			group: `${stem}-second-group`,
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId: firstCustomerId,
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: secondCustomerId }]),
				s.products({ list: [firstPlan, secondPlan] }),
			],
			actions: [],
		});
		await autumnV2_3.billing.attach({
			customer_id: firstCustomerId,
			plan_id: firstPlan.id,
		});
		await autumnV2_3.billing.attach({
			customer_id: secondCustomerId,
			plan_id: secondPlan.id,
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: firstPlan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: secondPlan.id,
			force_version: true,
			items: [itemsV2.monthlyWords({ included: 75 })],
		});
		const firstBefore = await readRepointableCustomerPlanRow({
			ctx,
			customerId: firstCustomerId,
			planId: firstPlan.id,
		});
		const secondBefore = await readRepointableCustomerPlanRow({
			ctx,
			customerId: secondCustomerId,
			planId: secondPlan.id,
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: {
				customer: {
					plan: {
						$or: [
							{ plan_id: firstPlan.id, version: 1 },
							{ plan_id: secondPlan.id, version: 1 },
						],
					},
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: {
							$or: [
								{ plan_id: firstPlan.id, version: 1 },
								{ plan_id: secondPlan.id, version: 1 },
							],
						},
						version: 2,
					},
				],
			},
		});

		expectBatchLane({ result });
		await expectRepoint({
			ctx,
			customerId: firstCustomerId,
			planId: firstPlan.id,
			before: firstBefore,
			targetVersion: 2,
		});
		await expectRepoint({
			ctx,
			customerId: secondCustomerId,
			planId: secondPlan.id,
			before: secondBefore,
			targetVersion: 2,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch version repoint: one customer holding two plans gets both repointed")}`,
	async () => {
		const stem = uniqueStem("bvr-multi-two-plans");
		const customerId = `${stem}-customer`;
		const firstPlan = products.base({
			id: `${stem}-first`,
			group: `${stem}-first-group`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const secondPlan = products.base({
			id: `${stem}-second`,
			group: `${stem}-second-group`,
			items: [items.monthlyWords({ includedUsage: 50 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [firstPlan, secondPlan] }),
			],
			actions: [
				s.billing.attach({ productId: firstPlan.id }),
				s.billing.attach({ productId: secondPlan.id }),
			],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: firstPlan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: secondPlan.id,
			force_version: true,
			items: [itemsV2.monthlyWords({ included: 75 })],
		});
		const firstBefore = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: firstPlan.id,
		});
		const secondBefore = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: secondPlan.id,
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: {
				customer: {
					plan: {
						$or: [
							{ plan_id: firstPlan.id, version: 1 },
							{ plan_id: secondPlan.id, version: 1 },
						],
					},
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: {
							$or: [
								{ plan_id: firstPlan.id, version: 1 },
								{ plan_id: secondPlan.id, version: 1 },
							],
						},
						version: 2,
					},
				],
			},
		});

		expectBatchLane({ result });
		await expectRepoint({
			ctx,
			customerId,
			planId: firstPlan.id,
			before: firstBefore,
			targetVersion: 2,
		});
		await expectRepoint({
			ctx,
			customerId,
			planId: secondPlan.id,
			before: secondBefore,
			targetVersion: 2,
		});
	},
);

for (const [index, scenario] of [
	{
		name: "the same source is touched twice",
		planFilter: (planId: string) => ({ plan_id: planId, version: 1 }),
		operations: (planId: string) => [
			{
				type: "update_plan" as const,
				plan_filter: { plan_id: planId, version: 1 },
				version: 2,
			},
			{
				type: "update_plan" as const,
				plan_filter: { plan_id: planId, version: 1 },
				version: 2,
			},
		],
	},
	{
		name: "a projected v1 to v2 then target-v2 chain",
		planFilter: (planId: string) => ({
			plan_id: planId,
			version: { $in: [1, 2] },
		}),
		operations: (planId: string) => [
			{
				type: "update_plan" as const,
				plan_filter: { plan_id: planId, version: 1 },
				version: 2,
			},
			{
				type: "update_plan" as const,
				plan_filter: { plan_id: planId, version: 2 },
				version: 3,
			},
		],
	},
	{
		name: "a version cycle",
		planFilter: (planId: string) => ({
			plan_id: planId,
			version: { $in: [1, 2] },
		}),
		operations: (planId: string) => [
			{
				type: "update_plan" as const,
				plan_filter: { plan_id: planId, version: 1 },
				version: 2,
			},
			{
				type: "update_plan" as const,
				plan_filter: { plan_id: planId, version: 2 },
				version: 1,
			},
		],
	},
	{
		name: "duplicate or disjuncts",
		planFilter: (planId: string) => ({ plan_id: planId, version: 1 }),
		operations: (planId: string) => [
			{
				type: "update_plan" as const,
				plan_filter: {
					$or: [
						{ plan_id: planId, version: 1 },
						{ plan_id: planId, version: 1 },
					],
				},
				version: 2,
			},
		],
	},
].entries()) {
	test.concurrent(
		`${chalk.yellowBright(`batch version repoint rejects: ${scenario.name}`)}`,
		async () => {
			// Kept short: the customer id becomes an email local part, capped at 64.
			const stem = uniqueStem(`bvr-mr-${index + 1}`);
			const customerId = `${stem}-customer`;
			const plan = products.base({
				id: `${stem}-plan`,
				items: [items.monthlyMessages({ includedUsage: 100 })],
			});
			const { ctx, autumnV2_3 } = await initScenario({
				customerId,
				setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
				actions: [s.billing.attach({ productId: plan.id })],
			});
			await autumnV2_3.post("/plans.update", {
				plan_id: plan.id,
				force_version: true,
				items: [itemsV2.monthlyMessages({ included: 200 })],
			});
			await autumnV2_3.post("/plans.update", {
				plan_id: plan.id,
				force_version: true,
				items: [itemsV2.monthlyMessages({ included: 300 })],
			});

			const { result } = await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${stem}-migration`,
				filter: { customer: { plan: scenario.planFilter(plan.id) } },
				operations: { customer: scenario.operations(plan.id) },
			});

			expectPerCustomerLaneWithRejections({
				result,
				codes: ["overlapping_operations"],
			});
		},
	);
}
