/**
 * V1 Attach → V2 Update Quantity Compatibility Tests
 *
 * Tests that verify V2's subscriptions.update() works correctly to update quantity for
 * customers who were initially attached via V1 billing.
 *
 * V1 attach:
 * - Uses autumnV1.attach() or s.attach()
 * - quantity = packs * billingUnits (EXCLUDING allowance)
 *
 * V2 subscriptions.update:
 * - Uses autumnV1.subscriptions.update()
 * - quantity = total units INCLUDING allowance
 *
 * Test flow:
 * 1. Use s.attach() for initial V1 attach (quantity excluding allowance)
 * 2. Use autumnV1.subscriptions.update() for V2 quantity update (quantity including allowance)
 *
 * updateSubscription always runs as V2 (a73cd1c2a), so the update swaps the V1
 * stripe_price_id item for the V2 prepaid price; the row keeps billing_version=V1.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	isPrepaidPrice,
	OnDecrease,
	OnIncrease,
	type UsagePriceConfig,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const getProSubscriptionState = async ({
	customerId,
	productId,
}: {
	customerId: string;
	productId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const cusProduct = fullCustomer.customer_products.find(
		(candidate) => candidate.product_id === productId,
	);
	const prepaidCusPrice = cusProduct?.customer_prices.find((cusPrice) =>
		isPrepaidPrice(cusPrice.price),
	);
	const subscriptionId = cusProduct?.subscription_ids?.[0];
	if (!prepaidCusPrice || !subscriptionId) {
		throw new Error(`Expected a subscribed prepaid price on ${productId}`);
	}

	const subscription =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	const quantityForPrice = (stripePriceId?: string | null) =>
		subscription.items.data.find((item) => item.price.id === stripePriceId)
			?.quantity;

	const config = prepaidCusPrice.price.config as UsagePriceConfig;
	return {
		v1PrepaidQuantity: quantityForPrice(config.stripe_price_id),
		v2PrepaidQuantity: quantityForPrice(config.stripe_prepaid_price_v2_id),
		itemCount: subscription.items.data.length,
	};
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: INCREMENT QUANTITY - MULTI BILLING UNITS (Messages)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v1→v2 compat: increment quantity (multi billing units)")}`, async () => {
	const customerId = "v1-v2-compat-incr-multi";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100; // Allowance

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Initial: 500 total units (including 100 allowance)
	// = 400 prepaid units = 4 packs
	// V1 attach quantity = 4 * 100 = 400 (excluding allowance)
	const initialTotalUnits = 500;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits; // 4

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V1 attach with quantity EXCLUDING allowance
			s.attach({
				productId: pro.id,
				options: [
					{
						feature_id: TestFeature.Messages,
						quantity: initialPacks * billingUnits,
					},
				],
			}),
		],
	});

	// Verify initial state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits, // allowance + prepaid
		balance: initialTotalUnits,
		usage: 0,
	});

	// V1 attach bills packs excluding allowance on stripe_price_id
	expect(
		await getProSubscriptionState({ customerId, productId: pro.id }),
	).toEqual({
		v1PrepaidQuantity: initialPacks,
		v2PrepaidQuantity: undefined,
		itemCount: 2,
	});

	// Upgrade: 500 → 800 total units (including 100 allowance)
	// = 700 prepaid units = 7 packs
	const updatedTotalUnits = 800;

	// V2 subscriptions.update with quantity INCLUDING allowance
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: updatedTotalUnits, // V2 expects total including allowance
			},
		],
	});

	// Verify customer feature balance updated correctly
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: updatedTotalUnits,
		balance: updatedTotalUnits,
		usage: 0,
	});

	// V2 prepaid price bills units including allowance: 800 / 100 = 8
	expect(
		await getProSubscriptionState({ customerId, productId: pro.id }),
	).toEqual({
		v1PrepaidQuantity: undefined,
		v2PrepaidQuantity: updatedTotalUnits / billingUnits,
		itemCount: 2,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 3 * pricePerPack, // added 3 packs
	});
});
