import type { AttachBranch } from "@autumn/shared";

enum ProrationBehavior {
	Immediately = "immediately",
	NextBilling = "next_billing",
	None = "none",
}

export interface AttachFlags {
	isPublic: boolean;
	forceCheckout: boolean;
	noPaymentMethod: boolean;
	invoiceOnly: boolean;
	isFree: boolean;
}

interface AttachConfig {
	onlyCheckout: boolean;
	carryUsage: boolean; // Whether to carry over existing usages
	branch: AttachBranch;
	proration: ProrationBehavior;
	disableTrial: boolean;
}
