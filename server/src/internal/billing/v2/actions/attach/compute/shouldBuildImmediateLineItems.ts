import { type AttachBillingContext, CusProductStatus } from "@autumn/shared";

export const shouldBuildImmediateLineItems = ({
	planTiming,
	customerProductStatus,
}: {
	planTiming: AttachBillingContext["planTiming"];
	customerProductStatus: CusProductStatus;
}): boolean => {
	if (planTiming !== "immediate") return false;
	return customerProductStatus !== CusProductStatus.Scheduled;
};
