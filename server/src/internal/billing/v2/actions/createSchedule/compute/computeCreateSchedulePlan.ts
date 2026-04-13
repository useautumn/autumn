import type {
	AutumnBillingPlan,
	MultiAttachBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeImmediateMultiProductPlan } from "../../common/immediateMultiProduct/computeImmediateMultiProductPlan";

/** Compute the immediate phase billing plan. */
export const computeCreateSchedulePlan = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: MultiAttachBillingContext;
}): AutumnBillingPlan =>
	computeImmediateMultiProductPlan({
		ctx,
		billingContext,
	});
