/**
 * V2 Attach → V1 Update Quantity Compatibility Tests
 *
 * Tests that verify V1's attach() works correctly to update quantity for
 * customers who were initially attached via V2 billing (using prepaid V2 pricing).
 *
 * V2 prepaid uses:
 * - stripe_prepaid_price_v2_id (per-unit pricing with free tier)
 * - Stripe quantity = units INCLUDING allowance
 * - Internal options.quantity = packs EXCLUDING allowance
 *
 * V1 prepaid uses:
 * - stripe_price_id (per-pack pricing)
 * - Stripe quantity = packs
 * - Internal options.quantity = packs EXCLUDING allowance
 *
 * Test flow:
 * 1. Use s.billing.attach() for initial V2 attach
 * 2. Use autumnV1.attach() for V1 quantity update
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingVersion,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { CusService } from "@/internal/customers/CusService";

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const getStripePrepaidSubscriptionItem = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId =
		fullCustomer.processor?.id || fullCustomer.processor?.processor_id;
	expect(stripeCustomerId).toBeDefined();

	const subscriptions = await stripeCli.subscriptions.list({
		customer: stripeCustomerId as string,
		status: "all",
	});

	expect(subscriptions.data.length).toBeGreaterThan(0);
	const subscription = subscriptions.data[0];

	// Find the prepaid item specifically (not the base price)
	// Prepaid items have quantity > 1 (packs) while base price has quantity = 1
	// Also check for metered/usage prices which have different characteristics
	const prepaidItem = subscription.items.data.find((item) => {
		// Base price items typically have quantity = 1 and no transform_quantity
		// Prepaid items have quantity representing packs
		const hasQuantityGreaterThanOne =
			item.quantity !== undefined && item.quantity > 1;
		const hasTransformQuantity =
			(item as { transform_quantity?: unknown }).transform_quantity !==
			undefined;
		return hasQuantityGreaterThanOne || hasTransformQuantity;
	});

	return { stripeCli, subscription, prepaidItem, stripeCustomerId };
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: INCREMENT QUANTITY - MULTI BILLING UNITS (Messages)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 compat: increment quantity (multi billing units)")}`, async () => {
	const customerId = "v2-v1-compat-incr-multi";
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
	const initialTotalUnits = 500;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
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

	const { prepaidItem: itemBefore } = await getStripePrepaidSubscriptionItem({
		customerId,
	});
	expect(itemBefore).toBeDefined();
	expect(itemBefore!.quantity).toBe(5);

	// Upgrade: 500 → 800 total units (including 100 allowance)
	// = 700 prepaid units = 7 packs
	const updatedTotalUnits = 800;
	const updatedPacks = (updatedTotalUnits - includedUsage) / billingUnits;

	// Use V1 attach to update quantity
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: updatedPacks * billingUnits,
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

	// Verify Stripe subscription item quantity
	const { prepaidItem: itemAfter } = await getStripePrepaidSubscriptionItem({
		customerId,
	});
	expect(itemAfter).toBeDefined();
	expect(itemAfter!.quantity).toBe(updatedPacks);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		billingVersion: BillingVersion.V1,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 3 * pricePerPack, // added 3 packs
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: DECREMENT QUANTITY - MULTI BILLING UNITS (Messages)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 compat: decrement quantity (multi billing units)")}`, async () => {
	const customerId = "v2-v1-compat-decr-multi";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

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

	// Start high: 800 total units = 7 packs
	const initialTotalUnits = 800;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
		],
	});

	// Track some usage first
	const messagesUsed = 150;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsed,
		},
		{ timeout: 2000 },
	);

	const { prepaidItem: itemBefore } = await getStripePrepaidSubscriptionItem({
		customerId,
	});
	expect(itemBefore).toBeDefined();
	expect(itemBefore!.quantity).toBe(8);

	// Downgrade: 800 → 400 total units = 3 packs
	const downgradedTotalUnits = 400;
	const downgradedPacks = (downgradedTotalUnits - includedUsage) / billingUnits; // 4

	// Use V1 attach to update quantity
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: downgradedPacks * billingUnits,
			},
		],
	});

	// Verify customer feature balance
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: downgradedTotalUnits,
		balance: downgradedTotalUnits - messagesUsed,
		usage: messagesUsed,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		billingVersion: BillingVersion.V1,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: -4 * pricePerPack, // removed 4 packs
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: DECREMENT WITH NO PRORATIONS
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 compat: decrement with no prorations")}`, async () => {
	const customerId = "v2-v1-compat-decr-no-prorate";
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedUsage = 100;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.None, // Key: no prorations on decrease
		},
	});

	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Start: 600 total units = 5 packs
	const initialTotalUnits = 600;
	const initialPacks = (initialTotalUnits - includedUsage) / billingUnits; // 5

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
		],
	});

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Get initial invoice count
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1, // Initial attach invoice
		latestTotal: (priceItem.price ?? 0) + initialPacks * pricePerPack,
	});

	// Downgrade: 600 → 300 total units = 2 packs
	const downgradedTotalUnits = 300;
	const downgradedPacks = (downgradedTotalUnits - includedUsage) / billingUnits; // 2

	// Use V1 attach to update quantity
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: downgradedPacks * billingUnits,
			},
		],
	});

	// With NoProrations, balance should NOT change immediately
	// The new quantity takes effect at next billing cycle
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance stays at initial (no immediate decrement)
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits, // Unchanged until renewal
		balance: initialTotalUnits,
		usage: 0,
	});

	// No new invoice should be created (no prorations)
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1, // Still just the initial invoice
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		billingVersion: BillingVersion.V1,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: downgradedPacks * pricePerPack + (priceItem.price ?? 0),
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		billingVersion: BillingVersion.V1,
	});
});
