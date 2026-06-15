import type { BillingContext, StripeSubscriptionAction } from "@autumn/shared";
import { AppEnv, ErrCode, RecaseError } from "@autumn/shared";
import { stripeSubscriptionToApplication } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isStripeConnected } from "@/internal/orgs/orgUtils";

const expectedStripeApplicationId = ({ ctx }: { ctx: AutumnContext }) =>
	ctx.env === AppEnv.Live
		? process.env.STRIPE_LIVE_CLIENT_ID
		: process.env.STRIPE_SANDBOX_CLIENT_ID;

const shouldValidateStripeApplicationOwnership = ({
	ctx,
}: {
	ctx: AutumnContext;
}) =>
	isStripeConnected({
		org: ctx.org,
		env: ctx.env,
		throughAccountId: true,
	}) &&
	!isStripeConnected({
		org: ctx.org,
		env: ctx.env,
		throughSecretKey: true,
	});

export const validateStripeSubscriptionActionOwnership = ({
	ctx,
	billingContext,
	stripeSubscriptionAction,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	stripeSubscriptionAction?: StripeSubscriptionAction;
}) => {
	if (!shouldValidateStripeApplicationOwnership({ ctx })) return;

	if (
		stripeSubscriptionAction?.type !== "update" &&
		stripeSubscriptionAction?.type !== "cancel"
	) {
		return;
	}

	const applicationId = stripeSubscriptionToApplication({
		stripeSubscription: billingContext.stripeSubscription,
	});
	if (!applicationId) return;

	const expectedApplicationId = expectedStripeApplicationId({ ctx });
	if (!expectedApplicationId) return;

	if (applicationId === expectedApplicationId) {
		return;
	}

	throw new RecaseError({
		message:
			"Cannot update subscription because it was not created by Autumn. Import or relink the subscription with no_billing_changes before changing billing.",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
		data: {
			stripe_subscription_id: billingContext.stripeSubscription?.id,
			stripe_application_id: applicationId,
		},
	});
};
