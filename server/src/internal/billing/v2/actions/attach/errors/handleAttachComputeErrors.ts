import type {
	AttachBillingContext,
	AttachParamsV1,
	AutumnBillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { validateCustomerEntitlementBatchTransitions } from "@/internal/billing/v2/actions/batchTransition/errors/validateCustomerEntitlementBatchTransitions";
import { handleLicenseTransitionErrors } from "@/internal/billing/v2/common/errors/handleLicenseTransitionErrors";
import { handleCurrencyMismatchErrors } from "./handleCurrencyMismatchErrors";
import { handleLicenseErrors } from "./handleLicenseErrors/handleLicenseErrors";

export const handleAttachComputeErrors = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
	params,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	params: AttachParamsV1;
}) => {
	handleCurrencyMismatchErrors({ ctx, billingContext, params });
	handleLicenseTransitionErrors({ autumnBillingPlan });
	handleLicenseErrors({ billingContext });
	await validateCustomerEntitlementBatchTransitions({
		ctx,
		transitions: autumnBillingPlan.customerLicenseTransitions,
	});
};
