import { type AttachBillingContext, CusProductStatus } from "@autumn/shared";

export const shouldBuildImmediateLineItems = ({
	planTiming,
	customerProductStatus,
	accessStartsAt,
}: {
	planTiming: AttachBillingContext["planTiming"];
	customerProductStatus: CusProductStatus;
	accessStartsAt?: number;
}): boolean => {
	if (accessStartsAt !== undefined) return false;
	if (planTiming !== "immediate") return false;
	return customerProductStatus !== CusProductStatus.Scheduled;
};
