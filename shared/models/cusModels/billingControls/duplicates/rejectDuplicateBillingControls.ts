import type { z } from "zod/v4";
import { findDuplicateBillingControlIssue } from "./findDuplicateBillingControlIssue.js";
import type { DuplicateCheckedBillingControls } from "./types/duplicateCheckedBillingControls.js";

/** Zod check: one entry per identity across every billing-control list.
 * Re-apply after extend(), which drops a schema's checks in this Zod version. */
export const rejectDuplicateBillingControls = (
	ctx: z.core.ParsePayload<DuplicateCheckedBillingControls>,
): void => {
	const issue = findDuplicateBillingControlIssue(ctx.value);
	if (issue) ctx.issues.push(issue);
};
