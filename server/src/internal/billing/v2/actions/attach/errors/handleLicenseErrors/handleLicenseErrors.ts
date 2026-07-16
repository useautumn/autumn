import type { AttachBillingContext, AutumnBillingPlan } from "@autumn/shared";
import { handleLicenseTransitionErrors } from "@/internal/billing/v2/common/errors/handleLicenseTransitionErrors";
import { handleDroppedLicenseErrors } from "./handleDroppedLicenseErrors";

export const handleLicenseErrors = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: AttachBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	handleLicenseTransitionErrors({ autumnBillingPlan });
	handleDroppedLicenseErrors({ billingContext, autumnBillingPlan });
};
