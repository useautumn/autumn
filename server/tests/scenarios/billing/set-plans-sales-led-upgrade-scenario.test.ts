/**
 * A sales-led customer on a custom Dedicated plan ($1k base + 3 prepaid regions at $1.5k, 20% coupon, invoice
 * collection), six days into the cycle, about to be upgraded to an $8k base. Run by hand, then QA from the dashboard.
 * Features: messages stands in for regions, users for seats, words for usage billed in arrears.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { CusService } from "@/internal/customers/CusService";

const setupDedicatedCustomer = async ({
	customerId,
	withCard = true,
}: {
	customerId: string;
	withCard?: boolean;
}) => {
	const free = products.base({ id: "free", isDefault: true, items: [] });
	const dedicated = products.base({
		id: "dedicated",
		items: [
			items.monthlyPrice({ price: 1000 }),
			items.prepaid({
				featureId: TestFeature.Messages,
				price: 1500,
				billingUnits: 1,
			}),
			items.prepaid({
				featureId: TestFeature.Users,
				price: 25,
				billingUnits: 1,
				includedUsage: 50,
			}),
			items.consumable({ featureId: TestFeature.Words, price: 0.05 }),
		],
	});
	const { autumnV1, autumnV2_4, ctx, testClockId, advancedTo } =
		await initScenario({
			customerId,
			setup: [
				s.products({ list: [free, dedicated] }),
				s.customer({
					...(withCard && { paymentMethod: "success" as const }),
					withDefault: true,
				}),
			],
			actions: [],
		});
	const couponId = `yc_20_off_${customerId}`;
	await ctx.stripeCli.coupons.del(couponId).catch(() => undefined);
	const coupon = await ctx.stripeCli.coupons.create({
		id: couponId,
		name: "YC 20% OFF",
		percent_off: 20,
		duration: "forever",
	});

	await autumnV2_4.billing.attach({
		customer_id: customerId,
		plan_id: dedicated.id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: 3 },
			{ feature_id: TestFeature.Users, quantity: 50 },
		],
		discounts: [{ reward_id: coupon.id }],
		invoice_mode: { enabled: true, enable_plan_immediately: true },
	});
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		startingFrom: new Date(advancedTo),
		numberOfDays: 6,
		waitForSeconds: 15,
	});

	return { autumnV1, autumnV2_4, ctx, dedicated };
};

test.concurrent(
	"scenario A: original state, $1k Dedicated live six days into its cycle",
	async () => {
		await setupDedicatedCustomer({ customerId: "sales-led-upgrade-original" });
	},
);

test.concurrent(
	"scenario B: the $1k Dedicated cancelling at period end, Free scheduled after it",
	async () => {
		const customerId = "sales-led-upgrade-cancelling";
		const { autumnV1, dedicated } = await setupDedicatedCustomer({
			customerId,
		});
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: dedicated.id,
			cancel_action: "cancel_end_of_cycle",
		});
	},
);

test.concurrent(
	"scenario C: no card on file, invoiced $1k Dedicated live six days in (the customer's real setup)",
	async () => {
		await setupDedicatedCustomer({
			customerId: "sales-led-upgrade-no-card",
			withCard: false,
		});
	},
);

test.concurrent(
	"scenario D: scenario C after Update to $8k with a cycle reset and no invoice mode: the plan is left pending behind a payment URL",
	async () => {
		const customerId = "sales-led-upgrade-no-card-updated";
		const { autumnV1, ctx, dedicated } = await setupDedicatedCustomer({
			customerId,
			withCard: false,
		});
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const liveDedicated = fullCustomer.customer_products.find(
			(customerProduct) => customerProduct.product.id === dedicated.id,
		);
		// The dashboard's Update sheet sends the edited items, not a customize block.
		const result = await autumnV1.subscriptions.update({
			customer_id: customerId,
			customer_product_id: liveDedicated?.id,
			product_id: dedicated.id,
			billing_cycle_anchor: "now",
			items: dedicated.items.map((item) =>
				item.feature_id ? item : { ...item, price: 8000 },
			),
		});
		console.log(
			JSON.stringify(
				{
					payment_url: result.payment_url,
					required_action: result.required_action,
					invoice: result.invoice,
				},
				null,
				2,
			),
		);
	},
);
