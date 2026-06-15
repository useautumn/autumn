import { type AttachBillingContext, CusProductStatus } from "@autumn/shared";

/**
 * Whether to invoice line items immediately for an attach.
 *
 * Returns false when access starts in the future (`accessStartsAt` set via
 * enable_plan_immediately, or a Scheduled product): nothing — including
 * one-off fees — is charged now. Recurring charges and one-off fees are billed
 * when the plan activates via its Stripe schedule.
 */
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
