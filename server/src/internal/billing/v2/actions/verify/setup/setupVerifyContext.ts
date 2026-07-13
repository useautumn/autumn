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

export type VerifyPrefetched = {
	fullCustomer?: FullCustomer;
	/** When provided, this IS the customer's active subscription set — no
	 * Stripe reads happen and coverage is judged against exactly these. */
	subscriptions?: Stripe.Subscription[];
};

export type VerifyContext = {
	fullCustomer: FullCustomer;
	/** Subscriptions Autumn knows about (linked from customer_products). */
	targets: VerifySubscriptionTarget[];
	/** Active Stripe subscriptions with no linked customer products. */
	unlinkedSubscriptions: Stripe.Subscription[];
	/** Ids of the customer's active Stripe subscriptions; null when unknown
	 * (no prefetch and no Stripe customer to list against). */
	activeSubscriptionIds: Set<string> | null;
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

const listActiveSubscriptions = async ({
	stripeCli,
	stripeCustomerId,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
}): Promise<Stripe.Subscription[]> => {
	const subscriptions: Stripe.Subscription[] = [];
	let startingAfter: string | undefined;
	while (true) {
		const page = await stripeCli.subscriptions.list({
			customer: stripeCustomerId,
			limit: 100,
			starting_after: startingAfter,
		});
		subscriptions.push(...page.data);
		if (!page.has_more) return subscriptions;
		startingAfter = page.data[page.data.length - 1]?.id;
	}
};

export const setupVerifyContext = async ({
	ctx,
	customerId,
	subscriptionIdsFilter,
	prefetched,
}: {
	ctx: AutumnContext;
	customerId: string;
	subscriptionIdsFilter?: string[];
	prefetched?: VerifyPrefetched;
}): Promise<VerifyContext> => {
	const fullCustomer =
		prefetched?.fullCustomer ??
		(await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		}));

	const cusProducts = fullCustomer.customer_products;
	const allowedSubscriptionIds = subscriptionIdsFilter
		? new Set(subscriptionIdsFilter)
		: null;
	const isAllowed = (subscriptionId: string) =>
		!allowedSubscriptionIds || allowedSubscriptionIds.has(subscriptionId);

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	// The customer's active Stripe subs — the coverage baseline. Without it a
	// customer with zero cusProducts would derive zero targets and pass vacuously.
	const stripeCustomerId = fullCustomer.processor?.id;
	const activeSubscriptions =
		prefetched?.subscriptions ??
		(stripeCustomerId
			? await listActiveSubscriptions({ stripeCli, stripeCustomerId })
			: null);
	const activeById = new Map(
		(activeSubscriptions ?? []).map((subscription) => [
			subscription.id,
			subscription,
		]),
	);

	const linkedSubscriptionIds = customerProductsToStripeSubscriptionIds({
		customerProducts: cusProducts,
	})
		.filter(notNullish)
		.filter(isAllowed);

	const targets: VerifySubscriptionTarget[] = [];
	for (const stripeSubscriptionId of linkedSubscriptionIds) {
		const stripeSubscription =
			activeById.get(stripeSubscriptionId) ??
			(await stripeCli.subscriptions.retrieve(stripeSubscriptionId, {
				expand: ["discounts.coupon"],
			}));

		const relatedCusProducts = cusProducts.filter((customerProduct) =>
			isRelevantForSubscription({ customerProduct, stripeSubscriptionId }),
		);

		targets.push({
			stripeSubscriptionId,
			stripeSubscription,
			relatedCusProducts,
		});
	}

	const linkedIdSet = new Set(linkedSubscriptionIds);
	const unlinkedSubscriptions = (activeSubscriptions ?? []).filter(
		(subscription) =>
			isAllowed(subscription.id) && !linkedIdSet.has(subscription.id),
	);

	return {
		fullCustomer,
		targets,
		unlinkedSubscriptions,
		activeSubscriptionIds: activeSubscriptions
			? new Set(activeById.keys())
			: null,
	};
};
