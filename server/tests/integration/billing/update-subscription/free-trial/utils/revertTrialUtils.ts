import { expect } from "bun:test";
import {
	ALL_STATUSES,
	type AttachParamsV1Input,
	CusProductStatus,
	FreeTrialDuration,
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
import type { AutumnInt } from "@/external/autumn/autumnCli";
import { CusService } from "@/internal/customers/CusService";

export const TRIAL_DAYS = 14;
export const EXTENDED_TRIAL_DAYS = 30;

export const setupRevertTrial = async ({
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

	await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: enterprise.id,
		feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		customize: {
			free_trial: {
				duration_length: TRIAL_DAYS,
				duration_type: FreeTrialDuration.Day,
				card_required: false,
				on_end: "revert",
			},
		},
	});

	const { trialCustomerProduct, pausedCustomerProduct } =
		await getRevertTrialCustomerProducts({
			ctx: scenario.ctx,
			customerId,
			trialProductId: enterprise.id,
			pausedProductId: pro.id,
		});

	const subscriptionId = pausedCustomerProduct.subscription_ids![0];
	const subscriptionBefore =
		await scenario.ctx.stripeCli.subscriptions.retrieve(subscriptionId);

	return {
		...scenario,
		pro,
		enterprise,
		trialCustomerProduct,
		pausedCustomerProduct,
		subscriptionBefore,
	};
};

const getRevertTrialCustomerProducts = async ({
	ctx,
	customerId,
	trialProductId,
	pausedProductId,
}: {
	ctx: TestContext;
	customerId: string;
	trialProductId: string;
	pausedProductId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
	const trialCustomerProduct = fullCustomer.customer_products.find(
		(customerProduct) =>
			customerProduct.product_id === trialProductId &&
			customerProduct.status === CusProductStatus.Active,
	);
	const pausedCustomerProduct = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product_id === pausedProductId,
	);

	expect(trialCustomerProduct).toBeDefined();
	expect(pausedCustomerProduct).toBeDefined();

	return {
		trialCustomerProduct: trialCustomerProduct!,
		pausedCustomerProduct: pausedCustomerProduct!,
	};
};

export const expectRevertTrialAfterUpdate = async ({
	ctx,
	customerId,
	trialProductId,
	pausedProductId,
	subscriptionBefore,
	expectedTrialEndsAt,
}: {
	ctx: TestContext;
	customerId: string;
	trialProductId: string;
	pausedProductId: string;
	subscriptionBefore: Stripe.Subscription;
	expectedTrialEndsAt: number;
}) => {
	const subscriptionAfter = await ctx.stripeCli.subscriptions.retrieve(
		subscriptionBefore.id,
	);
	expectStripeSubscriptionNotTrialing({ subscription: subscriptionAfter });
	expectStripeSubscriptionUnchanged({
		before: subscriptionBefore,
		after: subscriptionAfter,
	});

	const { trialCustomerProduct, pausedCustomerProduct } =
		await getRevertTrialCustomerProducts({
			ctx,
			customerId,
			trialProductId,
			pausedProductId,
		});

	expect(pausedCustomerProduct.status).toBe(CusProductStatus.Paused);
	expect(trialCustomerProduct.on_trial_end).toBe("revert");
	expect(trialCustomerProduct.previous_customer_product_id).toBe(
		pausedCustomerProduct.id,
	);
	expect(
		Math.abs(trialCustomerProduct.trial_ends_at! - expectedTrialEndsAt),
	).toBeLessThan(ms.hours(1));
};

export const extendRevertTrial = ({
	autumn,
	customerId,
	subscriptionId,
	onEnd,
}: {
	autumn: AutumnInt;
	customerId: string;
	subscriptionId: string;
	onEnd?: TrialOnEnd;
}) =>
	autumn.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
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

export const expectRevertTrialCancelled = async ({
	ctx,
	customerId,
	trialProductId,
	pausedProductId,
}: {
	ctx: TestContext;
	customerId: string;
	trialProductId: string;
	pausedProductId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});
	const trialStatuses = fullCustomer.customer_products
		.filter((customerProduct) => customerProduct.product_id === trialProductId)
		.map((customerProduct) => customerProduct.status);
	const restoredCustomerProduct = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.product_id === pausedProductId,
	);

	expect(trialStatuses).toContain(CusProductStatus.Expired);
	expect(trialStatuses).not.toContain(CusProductStatus.Active);
	expect(restoredCustomerProduct?.status).toBe(CusProductStatus.Active);

	return fullCustomer;
};
