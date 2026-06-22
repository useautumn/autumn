import type { BillingChangeResponse } from "@autumn/shared";

export const billingChangeResponseHasContent = (
	response: BillingChangeResponse,
): boolean => response.plan_changes.length > 0 || response.tags.length > 0;
