import type {
	FullCustomer,
	StripeReplacedSubscriptionAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { autumnStripeRequestOptions } from "@/external/stripe/common/autumnStripeIdempotency";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { expireReplacedPendingCustomerProducts } from "@/internal/billing/v2/actions/setPlans/utils/expireReplacedPendingCustomerProducts";
import { retryAsync } from "@/utils/retryAsync";

const TRANSIENT_STRIPE_ERROR_TYPES = new Set([
	"StripeRateLimitError",
	"StripeAPIError",
	"StripeConnectionError",
]);
const TOO_MANY_REQUESTS_STATUS = 429;
const SERVER_ERROR_STATUS = 500;

const isEndedStripeSubscription = (subscription: Stripe.Subscription) =>
	subscription.status === "canceled" ||
	subscription.status === "incomplete_expired";

const isResourceMissing = (error: unknown) =>
	(error as { code?: string } | undefined)?.code === "resource_missing";

const isTransientStripeError = (error: unknown) => {
	const { type, statusCode } = (error ?? {}) as {
		type?: string;
		statusCode?: number;
	};
	if (type && TRANSIENT_STRIPE_ERROR_TYPES.has(type)) return true;
	if (statusCode === undefined) return false;
	return (
		statusCode === TOO_MANY_REQUESTS_STATUS || statusCode >= SERVER_ERROR_STATUS
	);
};

const cancelReplacedSubscription = async ({
	ctx,
	customerId,
	stripeSubscriptionId,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeSubscriptionId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	try {
		await retryAsync({
			attempts: 3,
			delayMs: 500,
			maxDelayMs: 4000,
			shouldRetry: isTransientStripeError,
			run: async () => {
				const replacedSubscription =
					await stripeCli.subscriptions.retrieve(stripeSubscriptionId);
				if (isEndedStripeSubscription(replacedSubscription)) return;

				await stripeCli.subscriptions.cancel(
					stripeSubscriptionId,
					undefined,
					autumnStripeRequestOptions({ source: "set_plans_replace" }),
				);
			},
		});
	} catch (error) {
		if (isResourceMissing(error)) return;
		ctx.logger.error(
			`[executeStripeReplacedSubscriptionAction] Failed to cancel replaced subscription ${stripeSubscriptionId} for customer ${customerId}`,
			{ error, customerId, stripeSubscriptionId },
		);
	}
};

/**
 * Autumn's idempotency key marks the deleted webhook as an echo, so its Pending plans are expired here.
 * The new subscription already exists, so a cancel still failing after retries is logged rather than blocking its plan.
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
	await cancelReplacedSubscription({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		stripeSubscriptionId,
	});
	await expireReplacedPendingCustomerProducts({
		ctx,
		fullCustomer,
		replacedStripeSubscriptionId: stripeSubscriptionId,
	});
};
