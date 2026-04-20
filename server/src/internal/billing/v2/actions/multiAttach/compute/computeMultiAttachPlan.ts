import type {
	AutumnBillingPlan,
	MultiAttachBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeImmediateMultiProductPlan } from "../../common/immediateMultiProduct/computeImmediateMultiProductPlan";

/**
 * Computes the billing plan for attaching multiple products.
 *
 * For each product, creates a temporary AttachBillingContext and reuses
 * computeAttachNewCustomerProduct to build the new customer product.
 * At most one product may trigger a transition (validated by error handler).
 */
export const computeMultiAttachPlan = ({
	ctx,
	multiAttachBillingContext,
}: {
	ctx: AutumnContext;
	multiAttachBillingContext: MultiAttachBillingContext;
}): AutumnBillingPlan =>
	computeImmediateMultiProductPlan({
		ctx,
		billingContext: multiAttachBillingContext,
	});
