import type { StripeReplacedSubscriptionAction } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { autumnStripeRequestOptions } from "@/external/stripe/common/autumnStripeIdempotency";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

const isEndedStripeSubscription = (subscription: Stripe.Subscription) =>
	subscription.status === "canceled" ||
	subscription.status === "incomplete_expired";

const isResourceMissing = (error: unknown) =>
	(error as { code?: string } | undefined)?.code === "resource_missing";

/**
 * Autumn's idempotency key marks the deleted webhook as an echo, so it expires nothing.
 * The new subscription already exists, so a failed cancel is logged rather than blocking its plan.
 */
export const executeStripeReplacedSubscriptionAction = async ({
	ctx,
	replacedSubscriptionAction,
}: {
	ctx: AutumnContext;
	replacedSubscriptionAction?: StripeReplacedSubscriptionAction;
}) => {
	if (!replacedSubscriptionAction) return;

	const { stripeSubscriptionId } = replacedSubscriptionAction;
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
