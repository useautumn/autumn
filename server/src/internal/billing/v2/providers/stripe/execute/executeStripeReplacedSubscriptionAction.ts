import type {
	FullCustomer,
	StripeReplacedSubscriptionAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { autumnStripeRequestOptions } from "@/external/stripe/common/autumnStripeIdempotency";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { expireReplacedPendingCustomerProducts } from "@/internal/billing/v2/actions/setPlans/utils/expireReplacedPendingCustomerProducts";

const isEndedStripeSubscription = (subscription: Stripe.Subscription) =>
	subscription.status === "canceled" ||
	subscription.status === "incomplete_expired";

const isResourceMissing = (error: unknown) =>
	(error as { code?: string } | undefined)?.code === "resource_missing";

const cancelReplacedSubscription = async ({
	ctx,
	stripeSubscriptionId,
}: {
	ctx: AutumnContext;
	stripeSubscriptionId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	try {
		const replacedSubscription =
			await stripeCli.subscriptions.retrieve(stripeSubscriptionId);
		if (isEndedStripeSubscription(replacedSubscription)) return;

		await stripeCli.subscriptions.cancel(
			stripeSubscriptionId,
			undefined,
			autumnStripeRequestOptions({ source: "set_plans_replace" }),
		);
	} catch (error) {
		if (isResourceMissing(error)) return;
		ctx.logger.error(
			`[executeStripeReplacedSubscriptionAction] Failed to cancel replaced subscription ${stripeSubscriptionId}`,
			{ error, stripeSubscriptionId },
		);
	}
};

/**
 * Autumn's idempotency key marks the deleted webhook as an echo, so its Pending plans are expired here.
 * The new subscription already exists, so a failed cancel is logged rather than blocking its plan.
 */
export const executeStripeReplacedSubscriptionAction = async ({
	ctx,
	fullCustomer,
	replacedSubscriptionAction,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	replacedSubscriptionAction?: StripeReplacedSubscriptionAction;
}) => {
	if (!replacedSubscriptionAction) return;

	const { stripeSubscriptionId } = replacedSubscriptionAction;
	await cancelReplacedSubscription({ ctx, stripeSubscriptionId });
	await expireReplacedPendingCustomerProducts({
		ctx,
		fullCustomer,
		replacedStripeSubscriptionId: stripeSubscriptionId,
	});
};
