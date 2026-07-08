/**
 * TDD test for sync.ts's alreadyLinked guard blocking the V0 repair flow.
 *
 * Red-failure mode (current behavior):
 *  - Once a Stripe subscription is linked to an active product instance,
 *    ANY later /billing.sync call for that same product silently no-ops —
 *    even when the caller passes expire_previous: true with corrected items
 *    to intentionally expire-and-replace the existing (wrong) attach. The
 *    endpoint still reports success: true.
 *
 * Green-success criteria (after fix):
 *  - A repair sync with expire_previous: true expires the existing linked
 *    product and inserts the corrected replacement.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeSubscriptionFromProduct } from "./utils/syncTestUtils";

test.concurrent(
	`${chalk.yellowBright("sync-already-linked-repair: expire_previous repair sync replaces an already-linked product")}`,
	async () => {
		const customerId = "sync-already-linked-repair";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const stripeSubscription = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});

		// 1. First sync links the subscription to Pro (simulates the
		// already-linked state left behind by an auto-sync race).
		const firstSync = await autumnV1.post("/billing.sync", {
			customer_id: customerId,
			mappings: [
				{ stripe_subscription_id: stripeSubscription.id, plan_id: pro.id },
			],
		});
		expect(firstSync.results[0].success).toBe(true);

		const customerAfterFirstSync =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerFeatureCorrect({
			customer: customerAfterFirstSync,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// 2. Repair sync: same subscription/plan, but with expire_previous: true
		// and corrected items — should expire the wrong attach and replace it.
		const repairSync = await autumnV1.post("/billing.sync", {
			customer_id: customerId,
			mappings: [
				{
					stripe_subscription_id: stripeSubscription.id,
					plan_id: pro.id,
					expire_previous: true,
					items: [
						items.monthlyMessages({ includedUsage: 200 }),
					],
				},
			],
		});
		expect(repairSync.results[0].success).toBe(true);

		const customerAfterRepair =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// The repair must actually apply — not silently no-op at 100.
		expectCustomerFeatureCorrect({
			customer: customerAfterRepair,
			featureId: TestFeature.Messages,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		// Only one active instance in the group — the old one was expired,
		// not left behind as a duplicate.
		const activeProInstances = customerAfterRepair.products.filter(
			(p) => p.id === pro.id && p.status === "active",
		);
		expect(activeProInstances).toHaveLength(1);
	},
);
