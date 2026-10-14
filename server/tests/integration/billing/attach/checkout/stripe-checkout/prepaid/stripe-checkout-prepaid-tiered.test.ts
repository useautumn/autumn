import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid-tiered 1: multiple prepaid features with quantity update")}`, async () => {
	const customerId = "stripe-checkout-multi-prepaid";
	const billingUnits = 100;
	const basePrice = 20;

	const messagesIncluded = 100;
	const messagesPricePerPack = 10;
	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: messagesIncluded,
		billingUnits,
		price: messagesPricePerPack,
	});

	const wordsIncluded = 200;
	const wordsPricePerPack = 5;
	const prepaidWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: wordsIncluded,
		billingUnits,
		price: wordsPricePerPack,
	});

	const pro = products.pro({
		id: "pro-multi-prepaid",
		items: [prepaidMessagesItem, prepaidWordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const initialMessagesQty = 300;
	const initialWordsQty = 300;
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialMessagesQty,
				adjustable: true,
			},
			{
				feature_id: TestFeature.Words,
				quantity: initialWordsQty,
			},
		],
	});

	expect(result.payment_url).toBeDefined();

	const checkoutMessagesTotalUnits = 500;
	const checkoutMessagesStripePacks = checkoutMessagesTotalUnits / billingUnits;
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: checkoutMessagesStripePacks,
	});
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: checkoutMessagesTotalUnits,
		balance: checkoutMessagesTotalUnits,
		usage: 0,
	});

	const wordsRoundedQty = initialWordsQty;
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: wordsRoundedQty,
		balance: wordsRoundedQty,
		usage: 0,
	});

	const messagesPaidPacks =
		(checkoutMessagesTotalUnits - messagesIncluded) / billingUnits;
	const wordsPaidPacks = (wordsRoundedQty - wordsIncluded) / billingUnits;
	const expectedTotal =
		basePrice +
		messagesPaidPacks * messagesPricePerPack +
		wordsPaidPacks * wordsPricePerPack;

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid-tiered 2: tiered prepaid with quantity update")}`, async () => {
	const customerId = "stripe-checkout-tiered-prepaid";
	const billingUnits = 100;
	const basePrice = 20;

	const tieredPrepaidItem = items.tieredPrepaidMessages({
		includedUsage: 0,
		billingUnits,
		tiers: [
			{ to: 500, amount: 10 },
			{ to: "inf", amount: 5 },
		],
	});

	const pro = products.pro({
		id: "pro-tiered-checkout",
		items: [tieredPrepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const initialQuantity = 300;
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [
			{
				feature_id: TestFeature.Messages,
				quantity: initialQuantity,
				adjustable: true,
			},
		],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	const checkoutTotalUnits = 800;
	const checkoutStripePacks = checkoutTotalUnits / billingUnits;
	await completeStripeCheckoutForm({
		url: result.payment_url,
		overrideQuantity: checkoutStripePacks,
	});
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: checkoutTotalUnits,
		balance: checkoutTotalUnits,
		usage: 0,
	});

	const expectedPrepaidCost = 5 * 10 + 3 * 5;
	const expectedTotal = basePrice + expectedPrepaidCost;

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

const VOLUME_TIERS: { to: number | "inf"; amount: number }[] = [
	{ to: 500, amount: 30 },
	{ to: 1500, amount: 50 },
	{ to: "inf", amount: 70 },
];
const BASE_PRICE = 20;

test.concurrent(`${chalk.yellowBright("stripe-checkout-prepaid-tiered 3: prepaid volume: 300 units, 100 included, tier 1 → $30")}`, async () => {
	const customerId = "attach-prepaid-volume-included-tier1";
	const quantity = 300;
	const includedUsage = 100;

	const expectedPrepaidCost = 90;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage,
		tiers: VOLUME_TIERS,
	});

	const pro = products.pro({
		id: "pro-volume-included-tier1",
		items: [volumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [pro] })],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(BASE_PRICE + expectedPrepaidCost);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
		redirect_mode: "if_required",
	});
	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: quantity,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: BASE_PRICE + expectedPrepaidCost,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
