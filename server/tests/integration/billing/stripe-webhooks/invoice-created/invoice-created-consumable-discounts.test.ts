import { expect, test } from "bun:test";
import { type ApiCustomerV3, findPriceByFeatureId } from "@autumn/shared";
import {
	applyCustomerDiscount,
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

test.concurrent(`${chalk.yellowBright("invoice.created discount: customer-level discount applies to consumable overage")}`, async () => {
	const customerId = "inv-disc-cus-level";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applyCustomerDiscount({
		stripeCli,
		customerId: stripeCustomerId,
		couponId: coupon.id,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-100);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const discountMultiplier = 0.8;
	const basePrice = 20;
	const overageAmount = 100 * 0.1;
	const expectedTotal = Math.round(
		basePrice * discountMultiplier + overageAmount * discountMultiplier,
	);

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: expectedTotal,
		latestInvoiceProductId: pro.id,
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("invoice.created discount: subscription-level discount applies to consumable overage")}`, async () => {
	const customerId = "inv-disc-sub-level";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 25,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-200);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const discountMultiplier = 0.75;
	const basePrice = 20;
	const overageAmount = 200 * 0.1;
	const expectedTotal = Math.round(
		basePrice * discountMultiplier + overageAmount * discountMultiplier,
	);

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: expectedTotal,
		latestInvoiceProductId: pro.id,
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("invoice.created discount: base price only discount does NOT apply to consumable")}`, async () => {
	const customerId = "inv-disc-base-only";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: pro.id,
	});

	const basePriceProductId = fullProduct?.processor?.id;
	if (!basePriceProductId) {
		throw new Error("Could not find base price Stripe product ID");
	}

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 50,
		appliesToProducts: [basePriceProductId],
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-100);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const discountedBase = 20 * 0.5;
	const overageAmount = 100 * 0.1;
	const expectedTotal = discountedBase + overageAmount;

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: expectedTotal,
		latestInvoiceProductId: pro.id,
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

test.concurrent(`${chalk.yellowBright("invoice.created discount: consumable price only discount applies to overage")}`, async () => {
	const customerId = "inv-disc-cons-only";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: pro.id,
	});

	const consumablePrice = findPriceByFeatureId({
		prices: fullProduct?.prices ?? [],
		featureId: TestFeature.Messages,
	});

	const consumableProductId = consumablePrice?.config?.stripe_product_id;
	if (!consumableProductId) {
		throw new Error("Could not find consumable Stripe product ID");
	}

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 50,
		appliesToProducts: [consumableProductId],
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-100);

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const basePrice = 20;
	const discountedOverage = 100 * 0.1 * 0.5;
	const expectedTotal = basePrice + discountedOverage;

	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: expectedTotal,
		latestInvoiceProductId: pro.id,
	});

	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});
