import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Repro for Mintlify multi-entity discount bug.
 *
 * Production sequence (from Axiom logs):
 *  1. Entity 1 attaches pro (upgrade from Hobby) — creates subscription
 *  2. Discount applied to subscription
 *  3. Entity 1 cancels pro (end_of_cycle) — creates subscription schedule
 *  4. Entity 1 uncancels pro — schedule modified
 *  5. Entity 2 attaches pro — subscription update succeeds but schedule
 *     creation/update fails: "Discount di_xxx has exceeded its maximum
 *     number of applications and cannot be reused"
 *
 * The error is in stripeDiscountsToPhaseDiscounts which passes
 * { discount: "di_xxx" } to schedule phases — but the discount is bound
 * to the subscription, not the schedule.
 */
test(`${chalk.yellowBright("bug repro: entity 2 attach after cancel+uncancel with discount on sub")}`, async () => {
	const customerId = "multi-ent-cancel-uncancel";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	// Step 1: Entity 1 attaches pro
	const { autumnV2_2, autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
		],
	});

	// Step 2: Apply a discount to entity 1's subscription
	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 10,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	// Step 3: Entity 1 cancels pro (end_of_cycle) — creates subscription schedule
	console.log("Canceling entity 1 pro (end of cycle)...");
	await autumnV2_2.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Step 4: Entity 1 uncancels pro — schedule released/modified
	console.log("Uncanceling entity 1 pro...");
	await autumnV2_2.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: pro.id,
		cancel_action: "uncancel",
	});

	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Step 5: Entity 2 attaches pro
	console.log("Attaching pro to entity 2...");
	try {
		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[1].id,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
		console.log("Entity 2 result:", JSON.stringify(result, null, 2));
		console.log(chalk.red("BUG NOT REPRODUCED — entity 2 attach succeeded"));
	} catch (error: any) {
		console.log(chalk.green("BUG REPRODUCED — entity 2 attach failed:"));
		console.log("Error:", JSON.stringify(error, null, 2));
	}
});
