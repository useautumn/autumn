import { type AttachBillingContext, CusProductStatus } from "@autumn/shared";

/**
 * Decides whether (and how) to build immediate line items for an attach.
 *
 * - "all": charge everything now (normal immediate attach).
 * - "one-off-only": access is immediate but recurring billing starts later
 *   (enable_plan_immediately with a future starts_at). Only one-time charges
 *   like onboarding fees are invoiced now; the recurring portion is billed
 *   when the schedule activates.
 * - "none": nothing is charged now (pure scheduled / Scheduled status).
 */
export type ImmediateLineItemsMode = "all" | "one-off-only" | "none";

export const shouldBuildImmediateLineItems = ({
	planTiming,
	customerProductStatus,
	accessStartsAt,
}: {
	planTiming: AttachBillingContext["planTiming"];
	customerProductStatus: CusProductStatus;
	accessStartsAt?: number;
}): ImmediateLineItemsMode => {
	if (customerProductStatus === CusProductStatus.Scheduled) return "none";

	if (accessStartsAt !== undefined) return "one-off-only";

	if (planTiming !== "immediate") return "none";
	return "all";
};
