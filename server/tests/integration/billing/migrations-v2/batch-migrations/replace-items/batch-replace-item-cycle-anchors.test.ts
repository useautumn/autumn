/**
 * Replace keeps or recomputes reset cycles through the same anchor ladder as
 * batch add: live row, sibling, product, subscription, then product start.
 */
import { expect, test } from "bun:test";
import {
	type CreatePlanItemParamsV1,
	customerEntitlements,
	EntInterval,
	getCycleEnd,
	ResetInterval,
} from "@autumn/shared";
import type { PlanItemFilter } from "@autumn/shared/api/products/items/filter/planItemFilter.js";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { getCustomerEntitlementCycle } from "../batchTestUtils";
import { readScopedFeatureRow } from "../paidRowTestUtils";

type Scenario = Awaited<ReturnType<typeof initScenario>>;

const runReplace = async ({
	ctx,
	autumnV2_2,
	planId,
	migrationId,
	addItem,
	removeItem = { feature_id: TestFeature.Messages },
}: {
	ctx: Scenario["ctx"];
	autumnV2_2: Scenario["autumnV2_2"];
	planId: string;
	migrationId: string;
	addItem: CreatePlanItemParamsV1;
	removeItem?: PlanItemFilter;
}) => {
	const { result } = await runChunkedMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId,
		filter: { customer: { plan: { plan_id: planId, custom: false } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: planId, custom: false },
					customize: {
						add_items: [addItem],
						remove_items: [removeItem],
					},
				},
			],
		},
		noBillingChanges: true,
	});
	expect(result?.lane).toBe("batch");
};

test(`${chalk.yellowBright("batch migration: same-cadence replace keeps the live reset cycle")}`, async () => {
	const customerId = "batch-replace-cycle-same";
	const plan = products.base({
		id: "batch-replace-cycle-same-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
	const before = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	const resetCycleAnchor = Date.now() - 5 * 24 * 60 * 60 * 1_000;
	const nextResetAt = getCycleEnd({
		anchor: resetCycleAnchor,
		interval: EntInterval.Month,
		intervalCount: 1,
		now: Date.now(),
	});
	await ctx.db
		.update(customerEntitlements)
		.set({
			reset_cycle_anchor: resetCycleAnchor,
			next_reset_at: nextResetAt,
		})
		.where(eq(customerEntitlements.id, before.id));

	await runReplace({
		ctx,
		autumnV2_2,
		planId: plan.id,
		migrationId: "batch-replace-cycle-same-migration",
		addItem: itemsV2.monthlyMessages({ included: 200 }),
	});

	const after = await getCustomerEntitlementCycle({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.resetCycleAnchor).toBe(resetCycleAnchor);
	expect(after.nextResetAt).toBe(nextResetAt);
});

test(`${chalk.yellowBright("batch migration: lifetime-to-monthly replace falls back to product start")}`, async () => {
	const customerId = "batch-replace-cycle-free";
	const plan = products.base({
		id: "batch-replace-cycle-free-plan",
		items: [items.lifetimeMessages({ includedUsage: 100 })],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	await runReplace({
		ctx,
		autumnV2_2,
		planId: plan.id,
		migrationId: "batch-replace-cycle-free-migration",
		addItem: itemsV2.monthlyMessages({ included: 100 }),
	});

	const after = await getCustomerEntitlementCycle({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.cpBillingCycleAnchor).toBeNull();
	expect(after.resetCycleAnchor).toBe(after.cpStartsAt);
});

test(`${chalk.yellowBright("batch migration: monthly-to-lifetime replace clears the reset cycle")}`, async () => {
	const customerId = "batch-replace-cycle-lifetime";
	const plan = products.base({
		id: "batch-replace-cycle-lifetime-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	await runReplace({
		ctx,
		autumnV2_2,
		planId: plan.id,
		migrationId: "batch-replace-cycle-lifetime-migration",
		addItem: { feature_id: TestFeature.Messages, included: 100 },
	});

	const after = await getCustomerEntitlementCycle({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.resetCycleAnchor).toBeNull();
	expect(after.nextResetAt).toBeNull();
});

test(`${chalk.yellowBright("batch migration: cadence replace keeps the live anchor and recomputes cycle end")}`, async () => {
	const customerId = "batch-replace-cycle-quarter";
	const plan = products.base({
		id: "batch-replace-cycle-quarter-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
	const before = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	const resetCycleAnchor = Date.now() - 5 * 24 * 60 * 60 * 1_000;
	await ctx.db
		.update(customerEntitlements)
		.set({
			reset_cycle_anchor: resetCycleAnchor,
			next_reset_at: getCycleEnd({
				anchor: resetCycleAnchor,
				interval: EntInterval.Month,
				intervalCount: 1,
				now: Date.now(),
			}),
		})
		.where(eq(customerEntitlements.id, before.id));
	const now = Date.now();

	await runReplace({
		ctx,
		autumnV2_2,
		planId: plan.id,
		migrationId: "batch-replace-cycle-quarter-migration",
		addItem: {
			feature_id: TestFeature.Messages,
			included: 100,
			reset: { interval: ResetInterval.Quarter },
		},
	});

	const after = await getCustomerEntitlementCycle({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.resetCycleAnchor).toBe(resetCycleAnchor);
	expect(after.nextResetAt).toBe(
		getCycleEnd({
			anchor: after.resetCycleAnchor as number,
			interval: EntInterval.Quarter,
			intervalCount: 1,
			now,
		}),
	);
});

test(`${chalk.yellowBright("batch migration: lifetime-to-monthly replace adopts a sibling cycle")}`, async () => {
	const customerId = "batch-replace-cycle-sibling";
	const plan = products.base({
		id: "batch-replace-cycle-sibling-plan",
		items: [
			items.lifetimeMessages({ includedUsage: 100 }),
			items.monthlyWords({ includedUsage: 50 }),
		],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
	const sibling = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Words,
	});
	const siblingAnchor = Date.now() - 7 * 24 * 60 * 60 * 1_000;
	const siblingNextResetAt = getCycleEnd({
		anchor: siblingAnchor,
		interval: EntInterval.Month,
		intervalCount: 1,
		now: Date.now(),
	});
	await ctx.db
		.update(customerEntitlements)
		.set({
			reset_cycle_anchor: siblingAnchor,
			next_reset_at: siblingNextResetAt,
		})
		.where(eq(customerEntitlements.id, sibling.id));

	await runReplace({
		ctx,
		autumnV2_2,
		planId: plan.id,
		migrationId: "batch-replace-cycle-sibling-migration",
		addItem: itemsV2.monthlyMessages({ included: 100 }),
	});

	const after = await getCustomerEntitlementCycle({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.resetCycleAnchor).toBe(siblingAnchor);
	expect(after.nextResetAt).toBe(siblingNextResetAt);
});

test(`${chalk.yellowBright("batch migration: paid lifetime-to-monthly replace uses the product billing anchor")}`, async () => {
	const customerId = "batch-replace-cycle-paid";
	const plan = products.base({
		id: "batch-replace-cycle-paid-plan",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.lifetimeMessages({ includedUsage: 100 }),
		],
	});
	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	const before = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	await runReplace({
		ctx,
		autumnV2_2,
		planId: plan.id,
		migrationId: "batch-replace-cycle-paid-migration",
		addItem: itemsV2.monthlyMessages({ included: 100 }),
	});

	const after = await getCustomerEntitlementCycle({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(after.cpBillingCycleAnchor).not.toBeNull();
	expect(after.resetCycleAnchor).toBe(after.cpBillingCycleAnchor);
	expect(
		await readScopedFeatureRow({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		}),
	).toMatchObject({ id: before.id });
});
