import { DUPLICATE_CHECKS } from "./duplicateChecks.js";
import type { DuplicateBillingControlIssue } from "./types/duplicateBillingControlIssue.js";
import type { DuplicateCheckedBillingControls } from "./types/duplicateCheckedBillingControls.js";

/** The first duplicate across every control list present, as a validation issue. */
export const findDuplicateBillingControlIssue = (
	billingControls: DuplicateCheckedBillingControls,
): DuplicateBillingControlIssue | undefined => {
	for (const check of DUPLICATE_CHECKS) {
		const issue = check(billingControls);
		if (issue) return issue;
	}
	return undefined;
};
