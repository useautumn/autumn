import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { expectCustomerEntitlementRowCount } from "../../batchTestUtils";
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

const expectRepointedOnce = async ({
	ctx,
	customerId,
	planId,
	before,
	result,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	planId: string;
	before: Awaited<ReturnType<typeof readRepointableCustomerPlanRow>>;
	result: Parameters<typeof expectBatchLane>[0]["result"];
}) => {
	expectBatchLane({ result });
	const after = await readRepointableCustomerPlanRow({
		ctx,
		customerId,
		planId,
	});
	expectCustomerPlanRepointedInPlace({ before, after, targetVersion: 2 });
	expect(await readCustomerPlanRows({ ctx, customerId, planId })).toHaveLength(
		1,
	);
};

// version + customize: the version is a pure repoint; customize acts on the
// customer's current items. Untouched items keep their from-version
// definitions (grandfathered claims), mirroring per-customer setupPatchContext.
test.concurrent(
	`${chalk.yellowBright("batch version repoint customize: customize acts on the customer's items; version is a pure repoint")}`,
	async () => {
		const stem = uniqueStem("bvr-customize-target-patch");
		const customerId = `${stem}-customer`;
		const plan = products.base({
			id: `${stem}-plan`,
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.monthlyWords({ includedUsage: 25 }),
			],
		});
		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: plan.id,
			force_version: true,
			items: [
				itemsV2.monthlyMessages({ included: 200 }),
				itemsV2.monthlyWords({ included: 50 }),
				itemsV2.dashboard(),
			],
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
						customize: {
							remove_items: [
								{ feature_id: TestFeature.Messages },
								{ feature_id: TestFeature.Dashboard },
							],
							add_items: [
								itemsV2.monthlyMessages({ included: 300 }),
								itemsV2.monthlyCredits({ included: 40 }),
							],
						},
					},
				],
			},
		});

		await expectRepointedOnce({
			ctx,
			customerId,
			planId: plan.id,
			before,
			result,
		});
		expect(
			(
				await readScopedFeatureRow({
					ctx,
					customerId,
					featureId: TestFeature.Messages,
				})
			).balance,
		).toBe(300);
		await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		// The divergence pin: Words is untouched by customize, so it keeps the
		// customer's v1 allowance (25) — NOT the target version's 50.
		expect(
			(
				await readScopedFeatureRow({
					ctx,
					customerId,
					featureId: TestFeature.Words,
				})
			).balance,
		).toBe(25);
		// Dashboard exists only on the target catalog; a pure repoint never
		// grants it, and the unmatched remove filter is a no-op.
		await expect(
			readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Dashboard,
			}),
		).rejects.toThrow();
	},
);

test.concurrent(
	`${chalk.yellowBright("batch version repoint customize: an add lands exactly once even when the target version also carries the item")}`,
	async () => {
		const stem = uniqueStem("bvr-customize-dedupe");
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
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.monthlyCredits({ included: 40 }),
			],
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
						customize: {
							add_items: [itemsV2.monthlyCredits({ included: 40 })],
						},
					},
				],
			},
		});

		await expectRepointedOnce({
			ctx,
			customerId,
			planId: plan.id,
			before,
			result,
		});
		// The customer lacks Credits, so the add applies once; the target
		// catalog's own Credits row is never materialized (pure repoint).
		await expectCustomerEntitlementRowCount({
			ctx,
			customerId,
			planId: plan.id,
			featureId: TestFeature.Credits,
			count: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch version repoint customize: removing an item only the target version carries is a no-op")}`,
	async () => {
		const stem = uniqueStem("bvr-customize-target-only-remove");
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
			items: [itemsV2.monthlyMessages({ included: 100 }), itemsV2.dashboard()],
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
						customize: {
							remove_items: [{ feature_id: TestFeature.Dashboard }],
						},
					},
				],
			},
		});

		await expectRepointedOnce({
			ctx,
			customerId,
			planId: plan.id,
			before,
			result,
		});
		await expect(
			readScopedFeatureRow({
				ctx,
				customerId,
				featureId: TestFeature.Dashboard,
			}),
		).rejects.toThrow();
	},
);
