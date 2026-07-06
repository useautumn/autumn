import {
	cp,
	customerProductsToStripeSubscriptionIds,
	type FullCusProduct,
	type FullCustomer,
	notNullish,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

export type VerifySubscriptionTarget = {
	stripeSubscriptionId: string;
	stripeSubscription: Stripe.Subscription;
	relatedCusProducts: FullCusProduct[];
};

export type VerifyContext = {
	fullCustomer: FullCustomer;
	targets: VerifySubscriptionTarget[];
};

const isRelevantForSubscription = ({
	customerProduct,
	stripeSubscriptionId,
}: {
	customerProduct: FullCusProduct;
	stripeSubscriptionId: string;
}) =>
	cp(customerProduct)
		.paid()
		.recurring()
		.hasRelevantStatus()
		.onStripeSubscription({ stripeSubscriptionId }).valid;

export const setupVerifyContext = async ({
	ctx,
	customerId,
	subscriptionIdsFilter,
}: {
	ctx: AutumnContext;
	customerId: string;
	subscriptionIdsFilter?: string[];
}): Promise<VerifyContext> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});

	const cusProducts = fullCustomer.customer_products;

	const allowedSubscriptionIds = subscriptionIdsFilter
		? new Set(subscriptionIdsFilter)
		: null;

	const subscriptionIds = customerProductsToStripeSubscriptionIds({
		customerProducts: cusProducts,
	})
		.filter(notNullish)
		.filter(
			(subscriptionId) =>
				!allowedSubscriptionIds || allowedSubscriptionIds.has(subscriptionId),
		);

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const targets: VerifySubscriptionTarget[] = [];
	for (const stripeSubscriptionId of subscriptionIds) {
		const stripeSubscription = await stripeCli.subscriptions.retrieve(
			stripeSubscriptionId,
			{ expand: ["discounts.coupon"] },
		);

		const relatedCusProducts = cusProducts.filter((customerProduct) =>
			isRelevantForSubscription({ customerProduct, stripeSubscriptionId }),
		);

		targets.push({
			stripeSubscriptionId,
			stripeSubscription,
			relatedCusProducts,
		});
	}

	return { fullCustomer, targets };
};
