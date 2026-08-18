import { expect, test } from "bun:test";
import type { ProductItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import {
	expectBatchLane,
	expectCustomerPlanRepointedInPlace,
	readCustomerPlanRows,
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

// Plan versions accumulate across runs, so every test mints its own plan id to
// keep `version: 2` deterministic.
const uniqueStem = (name: string) =>
	`${name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

const unlimitedMessages = () => ({
	feature_id: TestFeature.Messages,
	unlimited: true,
});

const assertRepointed = async ({
	ctx,
	customerId,
	planId,
	before,
	targetVersion,
	result,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	planId: string;
	before: Awaited<ReturnType<typeof readRepointableCustomerPlanRow>>;
	targetVersion: number;
	result: Parameters<typeof expectBatchLane>[0]["result"];
}) => {
	expectBatchLane({ result });
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

for (const scenario of [
	{ name: "v1 to v2", sourceVersion: 1, targetVersion: 2 },
	{ name: "v2 to v1 rollback", sourceVersion: 2, targetVersion: 1 },
] as const) {
	test.concurrent(
		`${chalk.yellowBright(`batch version repoint: ${scenario.name}`)}`,
		async () => {
			const stem = uniqueStem(
				`bvr-basic-${scenario.sourceVersion}-to-${scenario.targetVersion}`,
			);
			const plan = products.base({
				id: `${stem}-plan`,
				items: [items.monthlyMessages({ includedUsage: 100 })],
			});
			const { ctx, autumnV2_3 } = await initScenario({
				customerId: `${stem}-customer`,
				setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
				actions: [],
			});
			await autumnV2_3.post("/plans.update", {
				plan_id: plan.id,
				force_version: true,
				items: [itemsV2.monthlyMessages({ included: 200 })],
			});
			await autumnV2_3.billing.attach({
				customer_id: `${stem}-customer`,
				plan_id: plan.id,
				version: scenario.sourceVersion,
			});
			const before = await readRepointableCustomerPlanRow({
				ctx,
				customerId: `${stem}-customer`,
				planId: plan.id,
			});

			const { result } = await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${stem}-migration`,
				filter: {
					customer: {
						plan: { plan_id: plan.id, version: scenario.sourceVersion },
					},
				},
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: {
								plan_id: plan.id,
								version: scenario.sourceVersion,
							},
							version: scenario.targetVersion,
						},
					],
				},
			});

			await assertRepointed({
				ctx,
				customerId: `${stem}-customer`,
				planId: plan.id,
				before,
				targetVersion: scenario.targetVersion,
				result,
			});
		},
	);
}

test.concurrent(
	`${chalk.yellowBright("batch version repoint: an already-target customer is a skipped no-op")}`,
	async () => {
		const stem = uniqueStem("bvr-basic-already-target");
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
			version: 2,
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						version: 2,
					},
				],
			},
		});

		expectBatchLane({ result });
		const after = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});
		expect(after).toEqual(before);
		expect(
			await readCustomerPlanRows({ ctx, customerId, planId: plan.id }),
		).toHaveLength(1);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch version repoint: identical free definitions still repoint catalog claims")}`,
	async () => {
		const stem = uniqueStem("bvr-basic-identical");
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
		const entitlementBefore = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [itemsV2.monthlyMessages({ included: 100 })],
		});
		const before = await readRepointableCustomerPlanRow({
			ctx,
			customerId,
			planId: plan.id,
		});

		const { result } = await runVersionRepointMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${stem}-migration`,
			filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id, version: 1 },
						version: 2,
					},
				],
			},
		});

		await assertRepointed({
			ctx,
			customerId,
			planId: plan.id,
			before,
			targetVersion: 2,
			result,
		});
		const entitlementAfter = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(entitlementAfter.id).toBe(entitlementBefore.id);
		expect(entitlementAfter.entitlement_id).not.toBe(
			entitlementBefore.entitlement_id,
		);
	},
);

for (const scenario of [
	{ name: "allowance increase", from: 100, to: 150, expectedBalance: 120 },
	{ name: "allowance decrease", from: 150, to: 100, expectedBalance: 70 },
] as const) {
	test.concurrent(
		`${chalk.yellowBright(`batch version repoint: ${scenario.name} preserves usage`)}`,
		async () => {
			const stem = uniqueStem(
				`bvr-basic-allowance-${scenario.from}-${scenario.to}`,
			);
			const customerId = `${stem}-customer`;
			const plan = products.base({
				id: `${stem}-plan`,
				items: [items.monthlyMessages({ includedUsage: scenario.from })],
			});
			const { ctx, autumnV2_3 } = await initScenario({
				customerId,
				setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
				actions: [
					s.billing.attach({ productId: plan.id }),
					s.track({
						featureId: TestFeature.Messages,
						value: 30,
						timeout: 2_000,
					}),
				],
			});
			await autumnV2_3.post("/plans.update", {
				plan_id: plan.id,
				force_version: true,
				items: [itemsV2.monthlyMessages({ included: scenario.to })],
			});
			const before = await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			});

			const { result } = await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${stem}-migration`,
				filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: plan.id, version: 1 },
							version: 2,
						},
					],
				},
			});

			await assertRepointed({
				ctx,
				customerId,
				planId: plan.id,
				before,
				targetVersion: 2,
				result,
			});
			const entitlement = await readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});
			expect(entitlement.balance).toBe(scenario.expectedBalance);
		},
	);
}

for (const scenario of [
	{
		name: "limited to unlimited",
		fromItems: [items.monthlyMessages({ includedUsage: 100 })],
		toItems: [unlimitedMessages()],
		expectedUnlimited: true,
	},
	{
		name: "unlimited to limited",
		fromItems: [items.unlimitedMessages()],
		toItems: [itemsV2.monthlyMessages({ included: 80 })],
		expectedUnlimited: false,
	},
] as const) {
	test.concurrent(
		`${chalk.yellowBright(`batch version repoint: ${scenario.name}`)}`,
		async () => {
			const stem = uniqueStem(
				`bvr-basic-${scenario.expectedUnlimited ? "to" : "from"}-unlimited`,
			);
			const customerId = `${stem}-customer`;
			const plan = products.base({
				id: `${stem}-plan`,
				items: [...scenario.fromItems] as ProductItem[],
			});
			const { ctx, autumnV2_3 } = await initScenario({
				customerId,
				setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
				actions: [s.billing.attach({ productId: plan.id })],
			});
			await autumnV2_3.post("/plans.update", {
				plan_id: plan.id,
				force_version: true,
				items: [...scenario.toItems],
			});
			const before = await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			});

			const { result } = await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${stem}-migration`,
				filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: plan.id, version: 1 },
							version: 2,
						},
					],
				},
			});

			await assertRepointed({
				ctx,
				customerId,
				planId: plan.id,
				before,
				targetVersion: 2,
				result,
			});
			expect(
				(
					await readScopedFeatureRow({
						ctx,
						customerId,
						featureId: TestFeature.Messages,
					})
				).unlimited,
			).toBe(scenario.expectedUnlimited);
		},
	);
}

for (const scenario of [
	{
		name: "adds a boolean",
		fromItems: [items.monthlyMessages({ includedUsage: 100 })],
		toItems: [itemsV2.monthlyMessages({ included: 100 }), itemsV2.dashboard()],
		presentFeature: TestFeature.Dashboard,
		absentFeature: undefined,
	},
	{
		name: "removes a boolean",
		fromItems: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.dashboard(),
		],
		toItems: [itemsV2.monthlyMessages({ included: 100 })],
		presentFeature: TestFeature.Messages,
		absentFeature: TestFeature.Dashboard,
	},
	{
		name: "swaps features",
		fromItems: [items.monthlyMessages({ includedUsage: 100 })],
		toItems: [itemsV2.monthlyWords({ included: 100 })],
		presentFeature: TestFeature.Words,
		absentFeature: TestFeature.Messages,
	},
] as const) {
	test.concurrent(
		`${chalk.yellowBright(`batch version repoint: ${scenario.name}`)}`,
		async () => {
			const stem = uniqueStem(
				`bvr-basic-${scenario.name.replaceAll(" ", "-")}`,
			);
			const customerId = `${stem}-customer`;
			const plan = products.base({
				id: `${stem}-plan`,
				items: [...scenario.fromItems],
			});
			const { ctx, autumnV2_3 } = await initScenario({
				customerId,
				setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
				actions: [s.billing.attach({ productId: plan.id })],
			});
			await autumnV2_3.post("/plans.update", {
				plan_id: plan.id,
				force_version: true,
				items: [...scenario.toItems],
			});
			const before = await readRepointableCustomerPlanRow({
				ctx,
				customerId,
				planId: plan.id,
			});

			const { result } = await runVersionRepointMigration({
				ctx,
				migrationClient: autumnV2_3,
				migrationId: `${stem}-migration`,
				filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
				operations: {
					customer: [
						{
							type: "update_plan",
							plan_filter: { plan_id: plan.id, version: 1 },
							version: 2,
						},
					],
				},
			});

			await assertRepointed({
				ctx,
				customerId,
				planId: plan.id,
				before,
				targetVersion: 2,
				result,
			});
			await readScopedFeatureRow({
				ctx,
				customerId,
				featureId: scenario.presentFeature,
			});
			if (scenario.absentFeature) {
				await expect(
					readScopedFeatureRow({
						ctx,
						customerId,
						featureId: scenario.absentFeature,
					}),
				).rejects.toThrow();
			}
		},
	);
}
