import {
	type AutumnBillingPlan,
	type CreateScheduleBillingContext,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isStripeConnected } from "@/internal/orgs/orgUtils";
import { productsMissingStripeProduct } from "../utils/ensureFreePhaseStripeProducts";

/** A free phase that ends later needs a $0 Stripe placeholder, so Stripe must be connected. */
export const handleFreePhaseStripeConnectionErrors = ({
	ctx,
	billingContext,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	if (billingContext.dryRunStripe || billingContext.skipBillingChanges) return;
	if (productsMissingStripeProduct({ autumnBillingPlan }).length === 0) return;
	if (isStripeConnected({ org: ctx.org, env: ctx.env })) return;

	throw new RecaseError({
		message:
			"Connect Stripe to schedule a transition out of a free plan. Autumn uses a $0 Stripe subscription to run the schedule.",
		code: ErrCode.StripeConfigNotFound,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
