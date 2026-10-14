import {
	type AutumnBillingPlan,
	type CreateScheduleBillingContext,
	ErrCode,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { isStripeConnected } from "@/internal/orgs/orgUtils";
import { productsMissingStripeProduct } from "../utils/ensureFreePhaseStripeProducts";
import { setPlansError } from "./setPlansError";

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
	const [freeProduct] = productsMissingStripeProduct({ autumnBillingPlan });
	if (!freeProduct) return;
	if (isStripeConnected({ org: ctx.org, env: ctx.env })) return;

	throw setPlansError({
		code: ErrCode.StripeConfigNotFound,
		details: { type: "free_plan_needs_stripe", plan_name: freeProduct.name },
	});
};
