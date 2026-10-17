import type { BillingContext, BillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingRoute } from "./billingRoute";

export type CheckBillingApprovalParams = {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	route: BillingRoute;
	/** A preview returns what the check found; anything else is the write. */
	preview?: boolean;
	/** A preview that stands in for its write, as a pending edit's before the discard. */
	gatesWrite?: boolean;
};
