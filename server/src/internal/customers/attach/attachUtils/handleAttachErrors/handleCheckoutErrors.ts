import type { AttachBranch } from "@autumn/shared";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import {
	handleCustomPaymentMethodErrors,
	handleExternalPSPErrors,
} from "../handleAttachErrors.js";

export const handleCheckoutErrors = ({
	attachParams,
	branch,
}: {
	attachParams: AttachParams;
	branch: AttachBranch;
}) => {
	handleCustomPaymentMethodErrors({
		attachParams,
	});

	handleExternalPSPErrors({
		attachParams,
	});

	// if (attachParams.setupPayment) {
	// 	// Make sure only usage prices are added?
	// }
};
