import type { StripeReplacedSubscriptionAction } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { autumnStripeRequestOptions } from "@/external/stripe/common/autumnStripeIdempotency";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Autumn's idempotency key marks the deleted webhook as an echo, so it expires nothing. */
export const executeStripeReplacedSubscriptionAction = async ({
	ctx,
	replacedSubscriptionAction,
}: {
	ctx: AutumnContext;
	replacedSubscriptionAction?: StripeReplacedSubscriptionAction;
}) => {
	if (!replacedSubscriptionAction) return;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	await stripeCli.subscriptions.cancel(
		replacedSubscriptionAction.stripeSubscriptionId,
		undefined,
		autumnStripeRequestOptions({ source: "set_plans_replace" }),
	);
};
