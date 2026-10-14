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
import { Decimal } from "decimal.js";

const BILLING_UNITS = 100;

const PREPAID_TIERS = [
	{ to: 500, amount: 10 },
	{ to: "inf" as const, amount: 5 },
];

test.concurrent(`${chalk.yellowBright("p2p: graduated prepaid to volume prepaid (mid-cycle proration)")}`, async () => {
	const quantity = 800;
	const basePrice = 20;

	const graduatedCost = 5 * 10 + 3 * 5;

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
			s.billing.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const initialCustomer =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: initialCustomer,
		count: 1,
		latestTotal: basePrice + graduatedCost,
	});

	const advancedTo = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 15,
	});

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

	const expectedAmount = new Decimal(proratedVolume)
		.minus(new Decimal(proratedGraduated))
		.toNumber();

	expect(preview.total).toBeGreaterThanOrEqual(expectedAmount - 0.01);
	expect(preview.total).toBeLessThanOrEqual(expectedAmount + 0.01);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

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

const CONSUMABLE_TIERS = [
	{ to: 500, amount: 0.1 },
	{ to: "inf" as const, amount: 0.05 },
];

test.concurrent(`${chalk.yellowBright("p2p: volume prepaid to graduated tiered consumable")}`, async () => {
	const quantity = 800;
	const basePrice = 20;

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
			s.billing.attach({
				productId: "pro",
				options: [{ feature_id: TestFeature.Messages, quantity }],
			}),
		],
	});

	const messagesUsage = 600;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].usage).toBe(
		messagesUsage,
	);

	const tieredConsumableItem = items.tieredConsumableMessages({
		includedUsage: 100,
		billingUnits: 1,
		tiers: CONSUMABLE_TIERS,
	});

	expect(tieredConsumableItem.tier_behavior).toBeUndefined();

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [tieredConsumableItem, priceItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(-volumeCost);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

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
