/** Exact Stripe Price IDs must select and persist the matching plan version. */

import { expect, test } from "bun:test";
import {
	filterCustomerProductsByActiveStatuses,
	filterCustomerProductsByStripeSubscriptionId,
	findCustomerEntitlementByFeature,
	isFixedPrice,
	type SyncParamsV1,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { billingActions } from "@/internal/billing/v2/actions";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { ProductService } from "@/internal/products/ProductService";
import { PriceService } from "@/internal/products/prices/PriceService";
import {
	createStripeFixedPriceUnderProduct,
	createStripeSubscriptionSchedule,
	getBaseStripePriceId,
	getProductStripeProductId,
	getStripeCustomerId,
} from "./utils/syncProductHelpers";

const setupVersionedPlan = async ({
	planId,
	customerId,
}: {
	planId: string;
	customerId: string;
}) => {
	const plan = products.pro({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan], prefix: "" }),
		],
		actions: [],
	});

	await autumnV2_2.post("/catalog.update", {
		plans: [
			{
				plan_id: planId,
				name: plan.name,
				force_version: true,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 200,
						reset: { interval: "month" },
					},
				],
			},
		],
	});

	const [v1, v2] = await Promise.all(
		[1, 2].map((version) =>
			ProductService.getFull({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				idOrInternalId: planId,
				version,
			}),
		),
	);

	const v1PriceId = getBaseStripePriceId({ fullProduct: v1 });
	const v2BasePrice = v2.prices[0];
	if (!v2BasePrice || !isFixedPrice(v2BasePrice)) {
		throw new Error(`Expected a fixed v2 base price for ${planId}`);
	}
	const v2StripePrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: getProductStripeProductId({ fullProduct: v2 }),
		unitAmount: 2_000,
	});
	await PriceService.updateConfig({
		db: ctx.db,
		id: v2BasePrice.id,
		config: {
			...v2BasePrice.config,
			stripe_price_id: v2StripePrice.id,
		},
	});

	return { v1, v2, v1PriceId, v2PriceId: v2StripePrice.id };
};

const createSubscription = async ({
	customerId,
	priceId,
}: {
	customerId: string;
	priceId: string;
}) =>
	ctx.stripeCli.subscriptions.create({
		customer: await getStripeCustomerId({ ctx, customerId }),
		items: [{ price: priceId }],
	});

const getPhases = ({ params }: { params: SyncParamsV1 }) => {
	if (!params.phases) throw new Error("Expected sync phases");
	return params.phases;
};

const expectLinkedVersion = async ({
	customerId,
	subscriptionId,
	internalProductId,
	expectedAllowance,
}: {
	customerId: string;
	subscriptionId: string;
	internalProductId: string;
	expectedAllowance: number;
}) => {
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
		withSubs: true,
	});
	const linked = filterCustomerProductsByActiveStatuses({
		customerProducts: filterCustomerProductsByStripeSubscriptionId({
			customerProducts: customer.customer_products,
			stripeSubscriptionId: subscriptionId,
		}),
	});
	expect(linked).toHaveLength(1);
	expect(linked[0]?.internal_product_id).toBe(internalProductId);
	const messages = findCustomerEntitlementByFeature({
		cusEnts: linked[0]?.customer_entitlements ?? [],
		featureId: TestFeature.Messages,
		errorOnNotFound: true,
	});
	expect(messages.entitlement.allowance).toBe(expectedAllowance);
};

test(`${chalk.yellowBright("billing.sync: exact Stripe Price selects plan version")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `sync_price_version_${suffix}`;
	const v1CustomerId = `sync-price-version-v1-${suffix}`;
	const v2CustomerId = `sync-price-version-v2-${suffix}`;
	const { v1, v2, v1PriceId, v2PriceId } = await setupVersionedPlan({
		planId,
		customerId: v1CustomerId,
	});
	await initScenario({
		customerId: v2CustomerId,
		setup: [s.customer({ paymentMethod: "success" })],
		actions: [],
	});
	const allVersions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
	});

	const v1Subscription = await createSubscription({
		customerId: v1CustomerId,
		priceId: v1PriceId,
	});
	const v1Proposal = await subscriptionToSyncParams({
		ctx,
		customerId: v1CustomerId,
		subscription: v1Subscription,
		fullProducts: allVersions,
	});
	expect(getPhases({ params: v1Proposal.params })[0]?.plans[0]).toMatchObject({
		plan_id: planId,
		version: 1,
	});
	await billingActions.syncV2({ ctx, params: v1Proposal.params });
	await expectLinkedVersion({
		customerId: v1CustomerId,
		subscriptionId: v1Subscription.id,
		internalProductId: v1.internal_id,
		expectedAllowance: 100,
	});

	const v2Subscription = await createSubscription({
		customerId: v2CustomerId,
		priceId: v2PriceId,
	});
	const v2Proposal = await subscriptionToSyncParams({
		ctx,
		customerId: v2CustomerId,
		subscription: v2Subscription,
		fullProducts: allVersions,
	});
	expect(getPhases({ params: v2Proposal.params })[0]?.plans[0]).toMatchObject({
		plan_id: planId,
		version: 2,
	});
	await billingActions.syncV2({ ctx, params: v2Proposal.params });
	await expectLinkedVersion({
		customerId: v2CustomerId,
		subscriptionId: v2Subscription.id,
		internalProductId: v2.internal_id,
		expectedAllowance: 200,
	});

	await billingActions.syncV2({ ctx, params: v2Proposal.params });
	await expectLinkedVersion({
		customerId: v2CustomerId,
		subscriptionId: v2Subscription.id,
		internalProductId: v2.internal_id,
		expectedAllowance: 200,
	});
});

test(`${chalk.yellowBright("billing.sync: schedule phases select exact plan versions")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `sync_schedule_version_${suffix}`;
	const customerId = `sync-schedule-version-${suffix}`;
	const { v1, v2, v1PriceId, v2PriceId } = await setupVersionedPlan({
		planId,
		customerId,
	});
	const { subscription, schedule } = await createStripeSubscriptionSchedule({
		ctx,
		customerId,
		phases: [
			{ items: [{ price: v1PriceId }] },
			{ items: [{ price: v2PriceId }] },
		],
	});
	const allVersions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
	});
	const proposal = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
		schedule,
		fullProducts: allVersions,
	});

	const phases = getPhases({ params: proposal.params });
	expect(phases).toHaveLength(2);
	expect(phases[0]?.plans[0]).toMatchObject({
		plan_id: planId,
		version: 1,
	});
	expect(phases[1]?.plans[0]).toMatchObject({
		plan_id: planId,
		version: 2,
	});

	const result = await billingActions.syncV2({ ctx, params: proposal.params });
	await expectLinkedVersion({
		customerId,
		subscriptionId: subscription.id,
		internalProductId: v1.internal_id,
		expectedAllowance: 100,
	});
	expect(result.scheduled_phases).toHaveLength(2);
	const scheduledId =
		result.scheduled_phases[result.scheduled_phases.length - 1]
			?.customer_product_ids[0];
	if (!scheduledId) throw new Error("Expected a scheduled customer product");
	const scheduled = await CusProductService.getFull({
		db: ctx.db,
		id: scheduledId,
	});
	expect(scheduled?.internal_product_id).toBe(v2.internal_id);
	const scheduledMessages = findCustomerEntitlementByFeature({
		cusEnts: scheduled?.customer_entitlements ?? [],
		featureId: TestFeature.Messages,
		errorOnNotFound: true,
	});
	expect(scheduledMessages.entitlement.allowance).toBe(200);
});
