import { expect, test } from "bun:test";
import { EntInterval, getCycleEnd } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runChunkedMigration } from "../../utils/runChunkedMigration";
import { getCustomerEntitlementCycle } from "../batchTestUtils";

const monthlyCycleEnd = ({ anchor, now }: { anchor: number; now: number }) =>
	getCycleEnd({
		anchor,
		interval: EntInterval.Month,
		intervalCount: 1,
		now,
	});

test.concurrent(
	`${chalk.yellowBright("batch metered add: pro plan anchors to each customer's billing cycle anchor")}`,
	async () => {
		const firstId = "batch-metered-pro-first";
		const secondId = "batch-metered-pro-second";
		const midCycleId = "batch-metered-pro-midcycle";
		const pro = products.pro({ id: "batch-metered-pro", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: firstId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.otherCustomers([
					{ id: secondId, paymentMethod: "success" },
					{ id: midCycleId, paymentMethod: "success" },
				]),
				s.products({ list: [pro] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: pro.id }),
					s.billing.attach({ customerId: secondId, productId: pro.id }),
				),
				s.advanceTestClock({ days: 10, waitForSeconds: 30 }),
				s.billing.attach({ customerId: midCycleId, productId: pro.id }),
			],
		});

		const now = Date.now();
		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-metered-pro-mig",
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						customize: {
							add_items: [itemsV2.monthlyMessages({ included: 100 })],
						},
					},
				],
			},
			noBillingChanges: true,
		});

		expect(result?.lane).toBe("batch");

		const cycles = new Map<string, { resetCycleAnchor: number | null }>();
		for (const customerId of [firstId, secondId, midCycleId]) {
			const cycle = await getCustomerEntitlementCycle({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});
			expect(cycle.cpBillingCycleAnchor).not.toBeNull();
			expect(cycle.resetCycleAnchor).toBe(cycle.cpBillingCycleAnchor);
			expect(cycle.nextResetAt).toBe(
				monthlyCycleEnd({ anchor: cycle.resetCycleAnchor as number, now }),
			);
			expect(cycle.balance).toBe(100);
			cycles.set(customerId, cycle);
		}

		const firstAnchor = cycles.get(firstId)?.resetCycleAnchor as number;
		const midCycleAnchor = cycles.get(midCycleId)?.resetCycleAnchor as number;
		expect(midCycleAnchor).toBeGreaterThan(firstAnchor);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch metered add: free plan anchors to cusProduct.starts_at")}`,
	async () => {
		const firstId = "batch-metered-free-first";
		const secondId = "batch-metered-free-second";
		const freePlan = products.base({ id: "batch-metered-free", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: firstId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: secondId }]),
				s.products({ list: [freePlan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: freePlan.id }),
					s.billing.attach({ customerId: secondId, productId: freePlan.id }),
				),
			],
		});

		const now = Date.now();
		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-metered-free-mig",
			filter: { customer: { plan: { plan_id: freePlan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: freePlan.id },
						customize: {
							add_items: [itemsV2.monthlyMessages({ included: 100 })],
						},
					},
				],
			},
			noBillingChanges: true,
		});

		expect(result?.lane).toBe("batch");
		for (const customerId of [firstId, secondId]) {
			const cycle = await getCustomerEntitlementCycle({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});
			expect(cycle.cpStartsAt).not.toBeNull();
			expect(cycle.resetCycleAnchor).toBe(cycle.cpStartsAt);
			expect(cycle.nextResetAt).toBe(
				monthlyCycleEnd({ anchor: cycle.resetCycleAnchor as number, now }),
			);
			expect(cycle.balance).toBe(100);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("batch metered add: aligns to a same-interval sibling's anchor")}`,
	async () => {
		const firstId = "batch-metered-sibling-first";
		const secondId = "batch-metered-sibling-second";
		const plan = products.base({
			id: "batch-metered-sibling",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: firstId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: secondId }]),
				s.products({ list: [plan] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: plan.id }),
					s.billing.attach({ customerId: secondId, productId: plan.id }),
				),
			],
		});

		const { result } = await runChunkedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "batch-metered-sibling-mig",
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: plan.id },
						customize: {
							add_items: [itemsV2.monthlyWords({ included: 100 })],
						},
					},
				],
			},
			noBillingChanges: true,
		});

		expect(result?.lane).toBe("batch");
		for (const customerId of [firstId, secondId]) {
			const sibling = await getCustomerEntitlementCycle({
				ctx,
				customerId,
				featureId: TestFeature.Messages,
			});
			const added = await getCustomerEntitlementCycle({
				ctx,
				customerId,
				featureId: TestFeature.Words,
			});
			expect(sibling.resetCycleAnchor).not.toBeNull();
			expect(added.resetCycleAnchor).toBe(sibling.resetCycleAnchor);
			expect(added.nextResetAt).toBe(sibling.nextResetAt);
			expect(added.balance).toBe(100);
		}
	},
);
