import { expect, test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { expectFactsMatchPreview } from "@tests/integration/approvals/utils/expectFactsMatchPreview";
import { permissionFactsClient } from "@tests/integration/approvals/utils/permissionFactsClient";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Discounts already on the subscription are the baseline: removing one raises the bill, keeping one adds nothing. */

const setupProWithCoupon = async ({ customerId }: { customerId: string }) => {
	const messages = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messages] });
	const premium = products.premium({ items: [messages] });
	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});
	const coupon = await createPercentCoupon({ stripeCli, percentOff: 100 });
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});
	return { pro, premium, coupon };
};

test.concurrent(
	`${chalk.yellowBright("discount facts 1: removing a 100% coupon raises the next cycle, so it's paid")}`,
	async () => {
		const customerId = "approvals-facts-remove-discount";
		const { pro, coupon } = await setupProWithCoupon({ customerId });

		const params: UpdateSubscriptionV1ParamsInput = {
			customer_id: customerId,
			plan_id: pro.id,
			remove_discounts: [{ reward_id: coupon.id }],
		};
		const { _permission_facts: facts, ...preview } =
			await permissionFactsClient().subscriptions.previewUpdate(params);

		expectFactsMatchPreview({ facts, preview });
		expect(facts.total).toBe(0);
		expect(facts.next_cycle?.total).toBe(20);
		expect(facts.paid).toBe(true);
		expect(facts.discounts).toEqual([]);
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("discount facts 2: an upgrade keeping the subscription's coupon adds no discount")}`,
	async () => {
		const customerId = "approvals-facts-keep-discount";
		const { premium } = await setupProWithCoupon({ customerId });

		const { _permission_facts: facts } =
			await permissionFactsClient().billing.previewAttach({
				customer_id: customerId,
				plan_id: premium.id,
			});

		expect(facts.incoming[0].plan_id).toBe(premium.id);
		expect(facts.discounts).toEqual([]);
	},
	300_000,
);
