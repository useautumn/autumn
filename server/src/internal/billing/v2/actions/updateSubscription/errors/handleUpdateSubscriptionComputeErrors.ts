import type { AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { validateCustomerEntitlementBatchTransitions } from "@/internal/billing/v2/actions/batchTransition/errors/validateCustomerEntitlementBatchTransitions";
import { handleLicenseTransitionErrors } from "@/internal/billing/v2/common/errors/handleLicenseTransitionErrors";

export const handleUpdateSubscriptionComputeErrors = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	handleLicenseTransitionErrors({ autumnBillingPlan });
	await validateCustomerEntitlementBatchTransitions({
		ctx,
		transitions: autumnBillingPlan.customerLicenseTransitions,
	});
};
