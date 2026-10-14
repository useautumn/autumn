import { expect, test } from "bun:test";
import { type ApiCustomerV3, findPriceByFeatureId } from "@autumn/shared";
import {
	applyCustomerDiscount,
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { getEntitySubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { ProductService } from "@/internal/products/ProductService";

test.concurrent(`${chalk.yellowBright("sub.deleted discount: customer-level discount applies to arrear invoice")}`, async () => {
	const customerId = "sub-del-disc-cus";

	const consumableItem = items.consumableMessages({
		includedUsage: 100,
	});
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, autumnV2_4, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.warmEntityCaches(),
		],
	});

	const entityId = entities[0].id;

	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: pro.id,
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
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 500,
	});
	await expectBalanceCorrect({
		autumn: autumnV2_4,
		customerId,
		entityId,
		featureId: TestFeature.Messages,
		granted: 100,
		usage: 500,
		remaining: 0,
		skipCache: true,
	});

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	const subAfterSchedule =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subAfterSchedule.cancel_at_period_end).toBe(true);

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 30,
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const expectedArrearTotal = Math.round(400 * 0.1 * 0.8);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: expectedArrearTotal,
	});
});

test.concurrent(`${chalk.yellowBright("sub.deleted discount: subscription-level discount applies to arrear invoice")}`, async () => {
	const customerId = "sub-del-disc-sub";

	const consumableItem = items.consumableMessages({
		includedUsage: 100,
	});
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, autumnV2_4, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.warmEntityCaches(),
		],
	});

	const entityId = entities[0].id;

	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
	});

	const coupon = await createPercentCoupon({
		stripeCli: ctx.stripeCli,
		percentOff: 30,
	});

	await applySubscriptionDiscount({
		stripeCli: ctx.stripeCli,
		subscriptionId,
		couponIds: [coupon.id],
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 300,
	});
	await expectBalanceCorrect({
		autumn: autumnV2_4,
		customerId,
		entityId,
		featureId: TestFeature.Messages,
		granted: 100,
		usage: 300,
		remaining: 0,
		skipCache: true,
	});

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-200);

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 30,
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const expectedArrearTotal = Math.round(200 * 0.1 * 0.7);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: expectedArrearTotal,
	});
});

test.concurrent(`${chalk.yellowBright("sub.deleted discount: base price only discount does NOT apply to arrear")}`, async () => {
	const customerId = "sub-del-disc-base";

	const consumableItem = items.consumableMessages({
		includedUsage: 100,
	});
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, autumnV2_4, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0, timeout: 5000 }),
			s.warmEntityCaches(),
		],
	});

	const entityId = entities[0].id;

	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
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
		stripeCli: ctx.stripeCli,
		percentOff: 50,
		appliesToProducts: [basePriceProductId],
	});

	await applySubscriptionDiscount({
		stripeCli: ctx.stripeCli,
		subscriptionId,
		couponIds: [coupon.id],
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 200,
	});
	await expectBalanceCorrect({
		autumn: autumnV2_4,
		customerId,
		entityId,
		featureId: TestFeature.Messages,
		granted: 100,
		usage: 200,
		remaining: 0,
		skipCache: true,
	});

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-100);

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		beforeFinalize: async () =>
			expectCustomerInvoiceCorrect({
				autumn: autumnV1,
				customerId,
				count: 2,
				latestTotal: 10,
				settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			}),
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const expectedArrearTotal = 100 * 0.1;

	await expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: expectedArrearTotal,
	});
});

test.concurrent(`${chalk.yellowBright("sub.deleted discount: consumable price only discount applies to arrear")}`, async () => {
	const customerId = "sub-del-disc-cons";

	const consumableItem = items.consumableMessages({
		includedUsage: 100,
	});
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, autumnV2_4, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.warmEntityCaches(),
		],
	});

	const entityId = entities[0].id;

	const entity = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId,
		productId: pro.id,
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
		stripeCli: ctx.stripeCli,
		percentOff: 40,
		appliesToProducts: [consumableProductId],
	});

	await applySubscriptionDiscount({
		stripeCli: ctx.stripeCli,
		subscriptionId,
		couponIds: [coupon.id],
	});

	await autumnV1.track({
		customer_id: customerId,
		entity_id: entityId,
		feature_id: TestFeature.Messages,
		value: 300,
	});
	await expectBalanceCorrect({
		autumn: autumnV2_4,
		customerId,
		entityId,
		featureId: TestFeature.Messages,
		granted: 100,
		usage: 300,
		remaining: 0,
		skipCache: true,
	});

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-200);

	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		advanceTo: addMonths(new Date(), 1).getTime(),
		waitForSeconds: 30,
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityAfterCancel,
		productId: pro.id,
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const expectedArrearTotal = Math.round(200 * 0.1 * 0.6);

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: expectedArrearTotal,
	});
});
