import type { AttachBillingContext } from "@autumn/shared";
import { handleDroppedLicenseErrors } from "./handleDroppedLicenseErrors";

export const handleLicenseErrors = ({
	billingContext,
}: {
	billingContext: AttachBillingContext;
}) => {
	handleDroppedLicenseErrors({ billingContext });
};
