import { type AttachBillingContext, CusProductStatus } from "@autumn/shared";

export const shouldBuildImmediateLineItems = ({
	planTiming,
	customerProductStatus,
	billingStartsAt,
}: {
	planTiming: AttachBillingContext["planTiming"];
	customerProductStatus: CusProductStatus;
	billingStartsAt?: number;
}): boolean => {
	if (billingStartsAt !== undefined) return false;
	if (planTiming !== "immediate") return false;
	return customerProductStatus !== CusProductStatus.Scheduled;
};
