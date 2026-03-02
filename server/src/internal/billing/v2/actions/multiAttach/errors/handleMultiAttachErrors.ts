import type { MultiAttachBillingContext } from "@autumn/shared";
import { handleMultiAttachCurrentProductErrors } from "./handleMultiAttachCurrentProductErrors";
import { handleMultiAttachRedirectErrors } from "./handleMultiAttachRedirectErrors";

/**
 * Runs all multi-attach validation checks.
 */
export const handleMultiAttachErrors = ({
	billingContext,
	redirectMode,
}: {
	billingContext: MultiAttachBillingContext;
	redirectMode: string;
}) => {
	handleMultiAttachCurrentProductErrors({
		productContexts: billingContext.productContexts,
	});

	handleMultiAttachRedirectErrors({
		redirectMode,
		stripeSubscription: billingContext.stripeSubscription,
	});
};
