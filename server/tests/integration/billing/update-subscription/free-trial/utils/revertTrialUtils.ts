import { expect } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
	FreeTrialDuration,
	type FullCusProduct,
	ms,
	type ProductV2,
	type TrialOnEnd,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeSubscriptionNotTrialing } from "@tests/integration/billing/utils/stripe/expectStripeSubscriptionNotTrialing";
import { expectStripeSubscriptionUnchanged } from "@tests/integration/billing/utils/stripe/expectStripeSubscriptionUnchanged";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";
import { expireTrialProductsForCustomer } from "@/cron/productCron/expireTrialProductsForCustomer";
import type { AutumnInt } from "@/external/autumn/autumnCli";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export const TRIAL_DAYS = 14;
export const EXTENDED_TRIAL_DAYS = 30;

export const setupProSubscription = async ({
	customerId,
	extraProducts = [],
}: {
	customerId: string;
	extraProducts?: ProductV2[];
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const enterprise = products.base({
		id: "enterprise",
		items: [
			items.monthlyPrice({ price: 50 }),
			items.prepaidMessages({ billingUnits: 100, price: 10 }),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, enterprise, ...extraProducts] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	return { ...scenario, pro, enterprise, entityId: undefined };
};

export const setupRevertTrial = async ({
	customerId,
	extraProducts,
}: {
	customerId: string;
	extraProducts?: ProductV2[];
}) =>
	addRevertTrial({
		customerId,
		subscription: await setupProSubscription({ customerId, extraProducts }),
		featureQuantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
	});

export const addRevertTrial = async <
	Subscription extends {
		autumnV2_3: AutumnInt;
		ctx: TestContext;
		pro: ProductV2;
		enterprise: ProductV2;
		entityId?: string;
	},
>({
	customerId,
	subscription,
	featureQuantities,
}: {
	customerId: string;
	subscription: Subscription;
	featureQuantities?: AttachParamsV1Input["feature_quantities"];
}) => ({
	...subscription,
	...(await startRevertTrial({
		scenario: subscription,
		customerId,
		pro: subscription.pro,
		enterprise: subscription.enterprise,
		entityId: subscription.entityId,
		featureQuantities,
	})),
});

export const startRevertTrial = async ({
	scenario,
	customerId,
	pro,
	enterprise,
	entityId,
	featureQuantities,
}: {
	scenario: { autumnV2_3: AutumnInt; ctx: TestContext };
	customerId: string;
	pro: ProductV2;
	enterprise: ProductV2;
	entityId?: string;
	featureQuantities?: AttachParamsV1Input["feature_quantities"];
}) => {
	await attachRevertTrial({
		autumn: scenario.autumnV2_3,
		customerId,
		planId: enterprise.id,
		entityId,
		featureQuantities,
	});

	const { trialCustomerProduct, pausedCustomerProduct } =
		await getRevertTrialCustomerProducts({
			ctx: scenario.ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
			entityId,
		});
	const subscriptionBefore =
		await scenario.ctx.stripeCli.subscriptions.retrieve(
			pausedCustomerProduct.subscription_ids![0],
		);

	return { trialCustomerProduct, pausedCustomerProduct, subscriptionBefore };
};

export const attachRevertTrial = ({
	autumn,
	customerId,
	planId,
	entityId,
	featureQuantities,
}: {
	autumn: AutumnInt;
	customerId: string;
	planId: string;
	entityId?: string;
	featureQuantities?: AttachParamsV1Input["feature_quantities"];
}) =>
	autumn.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		entity_id: entityId,
		plan_id: planId,
		feature_quantities: featureQuantities,
		customize: {
			free_trial: {
				duration_length: TRIAL_DAYS,
				duration_type: FreeTrialDuration.Day,
				card_required: false,
				on_end: "revert",
			},
		},
	});

const isOnEntity = ({
	customerProduct,
	entityId,
}: {
	customerProduct: FullCusProduct;
	entityId?: string;
}) => entityId === undefined || customerProduct.entity_id === entityId;

export const getRevertTrialCustomerProducts = async ({
	ctx,
	customerId,
	trialProductId,
	pausedProductId,
	entityId,
}: {
	ctx: TestContext;
	customerId: string;
	trialProductId: string;
	pausedProductId: string;
	entityId?: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
	const onEntity = fullCustomer.customer_products.filter((customerProduct) =>
		isOnEntity({ customerProduct, entityId }),
	);
	const trialCustomerProduct = onEntity.find(
		(customerProduct) =>
			customerProduct.product_id === trialProductId &&
			customerProduct.status === CusProductStatus.Active,
	);
	const pausedCustomerProduct = onEntity.find(
		(customerProduct) => customerProduct.product_id === pausedProductId,
	);

	expect(trialCustomerProduct).toBeDefined();
	expect(pausedCustomerProduct).toBeDefined();

	return {
		trialCustomerProduct: trialCustomerProduct!,
		pausedCustomerProduct: pausedCustomerProduct!,
	};
};

export const expectSharedSubscriptionUntouched = async ({
	ctx,
	subscriptionBefore,
}: {
	ctx: TestContext;
	subscriptionBefore: Stripe.Subscription;
}) => {
	const subscriptionAfter = await ctx.stripeCli.subscriptions.retrieve(
		subscriptionBefore.id,
	);
	expectStripeSubscriptionNotTrialing({ subscription: subscriptionAfter });
	expectStripeSubscriptionUnchanged({
		before: subscriptionBefore,
		after: subscriptionAfter,
	});
};

export const expectRevertTrialAfterUpdate = async ({
	ctx,
	customerId,
	trialProductId,
	pausedProductId,
	subscriptionBefore,
	expectedTrialEndsAt,
	entityId,
}: {
	ctx: TestContext;
	customerId: string;
	trialProductId: string;
	pausedProductId: string;
	subscriptionBefore: Stripe.Subscription;
	expectedTrialEndsAt: number;
	entityId?: string;
}) => {
	await expectSharedSubscriptionUntouched({ ctx, subscriptionBefore });

	const { trialCustomerProduct, pausedCustomerProduct } =
		await getRevertTrialCustomerProducts({
			ctx,
			customerId,
			trialProductId,
			pausedProductId,
			entityId,
		});

	expect(pausedCustomerProduct.status).toBe(CusProductStatus.Paused);
	expect(trialCustomerProduct.on_trial_end).toBe("revert");
	expect(trialCustomerProduct.previous_customer_product_id).toBe(
		pausedCustomerProduct.id,
	);
	expect(
		Math.abs(trialCustomerProduct.trial_ends_at! - expectedTrialEndsAt),
	).toBeLessThan(ms.hours(1));

	return { trialCustomerProduct, pausedCustomerProduct };
};

export const extendRevertTrial = ({
	autumn,
	customerId,
	subscriptionId,
	entityId,
	onEnd,
}: {
	autumn: AutumnInt;
	customerId: string;
	subscriptionId: string;
	entityId?: string;
	onEnd?: TrialOnEnd;
}) =>
	autumn.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		entity_id: entityId,
		subscription_id: subscriptionId,
		customize: {
			free_trial: {
				duration_length: EXTENDED_TRIAL_DAYS,
				duration_type: FreeTrialDuration.Day,
				card_required: false,
				...(onEnd && { on_end: onEnd }),
			},
		},
	});

export const expireRevertTrial = async ({
	ctx,
	trialCustomerProduct,
}: {
	ctx: TestContext;
	trialCustomerProduct: FullCusProduct;
}) => {
	const nowMs = Date.now();
	await CusProductService.update({
		ctx,
		cusProductId: trialCustomerProduct.id,
		updates: { trial_ends_at: nowMs - ms.minutes(1) },
	});
	await expireTrialProductsForCustomer({
		ctx,
		internalCustomerId: trialCustomerProduct.internal_customer_id,
		nowMs,
	});
};

export const expectRevertTrialReverted = async ({
	ctx,
	customerId,
	trialProductId,
	pausedProductId,
	entityId,
}: {
	ctx: TestContext;
	customerId: string;
	trialProductId: string;
	pausedProductId: string;
	entityId?: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
	const onEntity = fullCustomer.customer_products.filter((customerProduct) =>
		isOnEntity({ customerProduct, entityId }),
	);
	const trialStatuses = onEntity
		.filter((customerProduct) => customerProduct.product_id === trialProductId)
		.map((customerProduct) => customerProduct.status);
	const restoredCustomerProduct = onEntity.find(
		(customerProduct) => customerProduct.product_id === pausedProductId,
	);

	expect(trialStatuses).toContain(CusProductStatus.Expired);
	expect(trialStatuses).not.toContain(CusProductStatus.Active);
	expect(restoredCustomerProduct?.status).toBe(CusProductStatus.Active);

	return { fullCustomer, restoredCustomerProduct: restoredCustomerProduct! };
};
