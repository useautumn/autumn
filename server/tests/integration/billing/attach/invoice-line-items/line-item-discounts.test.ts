import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

test.concurrent(`${chalk.yellowBright("line-item-discounts A: new plan with percent-off discount")}`, async () => {
	const customerId = "li-disc-new-plan";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-disc-new",
		items: [prepaidMessages],
	});

	const basePrice = 20;
	const prepaidPrice = 20;
	const percentOff = 25;
	const basePriceAfterDiscount = 15;
	const prepaidAfterDiscount = 15;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff,
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		discounts: [{ reward_id: coupon.id }],
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	const expectedTotalAfterDiscount =
		basePriceAfterDiscount + prepaidAfterDiscount;

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotalAfterDiscount,
	});

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		allCharges: true,
		expectedLineItems: [
			{
				isBasePrice: true,
				amount: basePrice,
				discount: {
					amountAfterDiscounts: basePriceAfterDiscount,
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice,
				billingTiming: "in_advance",
				discount: {
					totalAmountAfterDiscounts: prepaidAfterDiscount,
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("line-item-discounts B: upgrade with percent-off discount")}`, async () => {
	const customerId = "li-disc-upgrade";

	const proPrepaid = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const proConsumable = items.consumableWords({ includedUsage: 50 });

	const pro = products.pro({
		id: "pro-disc-upg",
		items: [proPrepaid, proConsumable],
	});

	const premiumPrepaid = items.prepaidMessages({
		includedUsage: 200,
		billingUnits: 100,
		price: 15,
	});
	const premiumConsumable = items.consumableWords({ includedUsage: 100 });

	const premium = products.premium({
		id: "premium-disc-upg",
		items: [premiumPrepaid, premiumConsumable],
	});

	const proMessagesQuantity = 300;
	const wordsTracked = 200;
	const premiumMessagesQuantity = 500;
	const percentOff = 20;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: proMessagesQuantity },
				],
			}),
			s.track({
				featureId: TestFeature.Words,
				value: wordsTracked,
				timeout: 5000,
			}),
		],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff,
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: premiumMessagesQuantity },
		],
		discounts: [{ reward_id: coupon.id }],
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedLineItems: [
			{
				isBasePrice: true,
				direction: "refund",
				productId: pro.id,
				minCount: 1,
				discount: {
					hasDiscounts: false,
				},
			},
			{
				featureId: TestFeature.Messages,
				direction: "refund",
				productId: pro.id,
				billingTiming: "in_advance",
				minCount: 1,
				discount: {
					hasDiscounts: false,
				},
			},
			{
				isBasePrice: true,
				direction: "charge",
				productId: premium.id,
				minCount: 1,
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			{
				featureId: TestFeature.Messages,
				direction: "charge",
				productId: premium.id,
				billingTiming: "in_advance",
				minCount: 1,
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			{
				featureId: TestFeature.Words,
				direction: "charge",
				billingTiming: "in_arrear",
				minCount: 1,
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("line-item-discounts C: stripe checkout with percent-off discount")}`, async () => {
	const customerId = "li-disc-checkout";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-disc-checkout",
		items: [prepaidMessages],
	});

	const basePrice = 20;
	const prepaidPrice = 20;
	const percentOff = 25;
	const basePriceAfterDiscount = 15;
	const prepaidAfterDiscount = 15;
	const expectedTotalAfterDiscount =
		basePriceAfterDiscount + prepaidAfterDiscount;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff,
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		discounts: [{ reward_id: coupon.id }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotalAfterDiscount,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		allCharges: true,
		expectedLineItems: [
			{
				isBasePrice: true,
				amount: basePrice,
				discount: {
					amountAfterDiscounts: basePriceAfterDiscount,
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice,
				billingTiming: "in_advance",
				discount: {
					totalAmountAfterDiscounts: prepaidAfterDiscount,
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("line-item-discounts D: renewal with forever discount")}`, async () => {
	const customerId = "li-disc-renewal";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const consumableWords = items.consumableWords({ includedUsage: 50 });

	const pro = products.pro({
		id: "pro-disc-renew",
		items: [prepaidMessages, consumableWords],
	});

	const percentOff = 25;
	const wordsTracked = 200;

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff,
		duration: "forever",
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		discounts: [{ reward_id: coupon.id }],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Words,
		value: wordsTracked,
	});
	await timeout(5000);

	await advanceToNextInvoice({
		stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expect(
		customer.invoices?.length,
		"Expected at least 2 invoices (initial + renewal)",
	).toBeGreaterThanOrEqual(2);

	const renewalInvoice = customer.invoices?.[0];
	expect(renewalInvoice?.stripe_id).toBeDefined();

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: renewalInvoice!.stripe_id,
		expectedLineItems: [
			{
				isBasePrice: true,
				direction: "charge",
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			{
				featureId: TestFeature.Messages,
				direction: "charge",
				billingTiming: "in_advance",
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
			{
				featureId: TestFeature.Words,
				direction: "charge",
				billingTiming: "in_arrear",
				discount: {
					hasDiscounts: true,
					couponIds: [coupon.id],
				},
			},
		],
	});
});
