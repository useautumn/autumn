import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { calculateProration } from "@tests/integration/billing/utils/proration/calculateProration";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// PAID-TO-PAID: TIER BEHAVIOR TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const BILLING_UNITS = 100;

// Tiers for prepaid pricing tests (same for graduated and volume)
const PREPAID_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

// 4.8 Graduated prepaid to volume prepaid (mid-cycle with proration)
test.concurrent(`${chalk.yellowBright("p2p: graduated prepaid to volume prepaid (mid-cycle proration)")}`, async () => {
	const quantity = 800;
	const basePrice = 20;

	// Graduated calculation: 5 packs × $10 + 3 packs × $5 = $65
	const graduatedCost = 5 * 10 + 3 * 5;

	// Volume calculation: 8 packs × $5 (tier 2 rate for all) = $40
	const volumeCost = 8 * 5;

	const graduatedItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: PREPAID_TIERS,
	});
	const priceItem = items.monthlyPrice({ price: basePrice });
	const pro = products.base({ id: "pro", items: [graduatedItem, priceItem] });

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "p2p-grad-to-vol-proration",
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	// Verify initial invoice (base price + graduated prepaid)
	const initialCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: initialCustomer,
		count: 1,
		latestTotal: basePrice + graduatedCost,
	});

	// Advance 15 days (mid-cycle)
	const advancedTo = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 15,
	});

	// Change to volume prepaid with same quantity
	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: PREPAID_TIERS,
	});

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [volumeItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Calculate prorated difference: credit old graduated, charge new volume
	const proratedGraduated = await calculateProration({
		customerId,
		advancedTo,
		amount: graduatedCost,
	});
	const proratedVolume = await calculateProration({
		customerId,
		advancedTo,
		amount: volumeCost,
	});

	// Volume is cheaper, so this should be a credit (negative)
	const expectedAmount = proratedVolume - proratedGraduated;

	expect(preview.total).toEqual(expectedAmount);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Balance should remain at 800 (quantity unchanged)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// Tiers for consumable pricing tests
const CONSUMABLE_TIERS = [
	{ to: 500, amount: 0.1 },
	{ to: "inf" as const, amount: 0.05 },
];

// 4.9 Volume prepaid to graduated tiered consumable
test.concurrent(`${chalk.yellowBright("p2p: volume prepaid to graduated tiered consumable")}`, async () => {
	const quantity = 800;
	const basePrice = 20;

	// Volume prepaid: 8 packs × $5 = $40
	const volumeCost = 8 * 5;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: BILLING_UNITS,
		tiers: PREPAID_TIERS,
	});
	const priceItem = items.monthlyPrice({ price: basePrice });
	const pro = products.base({ id: "pro", items: [volumeItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "p2p-vol-to-tiered-cons",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	// Track some usage (600 of 800 = 200 remaining)
	const messagesUsage = 600;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	// Verify customer has usage tracked
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].usage).toBe(
		messagesUsage,
	);

	// Change to tiered consumable with 100 included
	// tier_behavior should be undefined (defaults to graduated)
	const tieredConsumableItem = items.tieredConsumableMessages({
		includedUsage: 100,
		billingUnits: 1,
		tiers: CONSUMABLE_TIERS,
	});

	// Verify the item has no tier_behavior set (defaults to graduated)
	expect(tieredConsumableItem.tier_behavior).toBeUndefined();

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [tieredConsumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should refund full prepaid amount ($40)
	expect(preview.total).toBe(-volumeCost);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Usage should be preserved (600 tracked)
	// New included usage is 100, so balance = 100 - 600 = -500 (in overage)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: tieredConsumableItem.included_usage,
		balance: tieredConsumableItem.included_usage - messagesUsage,
		usage: messagesUsage,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
