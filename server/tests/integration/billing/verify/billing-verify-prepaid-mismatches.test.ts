/**
 * Billing Verify: Prepaid Mismatches
 *
 * Contract under test (billingActions.verify):
 *   New behaviors:
 *     - A prepaid feature item's Stripe quantity drifted from Autumn's record ->
 *       mismatch { type: "prepaid_quantity_mismatch", feature_id, expected_quantity,
 *       actual_quantity }.
 *     - An entity-scoped (inline-priced) prepaid item's Stripe unit amount drifted ->
 *       mismatch { type: "prepaid_price_mismatch", feature_id, expected_unit_amount,
 *       actual_unit_amount }.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import {
	corruptStripeSubscription,
	listActiveStripeSubscriptions,
} from "../restore/utils/corruptStripeSubscription";

const stripeCustomerIdFor = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId)
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	return stripeCustomerId;
};

const firstStripePriceIdFor = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}) => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	for (const price of fullProduct.prices) {
		const id =
			price.config.stripe_price_id ?? price.config.stripe_empty_price_id;
		if (id) return id;
	}
	throw new Error(`No Stripe price id on product ${productId}`);
};

test.concurrent(
	`${chalk.yellowBright("billing-verify prepaid-mismatches 1: prepaid quantity drifted -> prepaid_quantity_mismatch")}`,
	async () => {
		const customerId = "verify-prepaid-quantity-mismatch";

		const prepaidItem = items.prepaidMessages({
			includedUsage: 100,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro", items: [prepaidItem] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});

		const basePriceId = await firstStripePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});

		const prepaidSubItem = sub.items.data.find(
			(item) => item.price.id !== basePriceId,
		);
		if (!prepaidSubItem) throw new Error("Expected a prepaid item on sub");

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				setItemQuantities: [
					{
						priceId: prepaidSubItem.price.id,
						quantity: prepaidSubItem.quantity! + 1,
					},
				],
			},
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(result.subscriptions[0].mismatches).toEqual([
			{
				type: "prepaid_quantity_mismatch",
				feature_id: TestFeature.Messages,
				expected_quantity: prepaidSubItem.quantity!,
				actual_quantity: prepaidSubItem.quantity! + 1,
				phase_starts_at: undefined,
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify prepaid-mismatches 2: entity-scoped inline prepaid price drifted -> prepaid_price_mismatch")}`,
	async () => {
		const customerId = "verify-prepaid-price-mismatch";

		const prepaidItem = items.prepaidMessages({
			includedUsage: 100,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro", items: [prepaidItem] });

		const { ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});
		expect(entities.length).toBe(1);

		const basePriceId = await firstStripePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});

		const prepaidSubItem = sub.items.data.find(
			(item) => item.price.id !== basePriceId,
		);
		if (!prepaidSubItem)
			throw new Error("Expected an inline prepaid item on sub");
		expect(prepaidSubItem.metadata?.autumn_customer_price_id).toBeDefined();

		const originalUnitAmount = prepaidSubItem.price.unit_amount as number;

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				setInlineItemAmounts: [
					{
						priceId: prepaidSubItem.price.id,
						unitAmount: originalUnitAmount + 500,
					},
				],
			},
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(result.subscriptions[0].mismatches).toEqual([
			{
				type: "prepaid_price_mismatch",
				feature_id: TestFeature.Messages,
				expected_unit_amount: expect.any(String),
				actual_unit_amount: expect.any(String),
				phase_starts_at: undefined,
			},
		]);
	},
);
