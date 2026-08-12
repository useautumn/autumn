import { type RolloverConfig, rolloverConfigToIssue } from "@autumn/shared";
import { toast } from "sonner";

/** Client-side gate running the same shared rules the server enforces. */
export const checkRolloverConfigValid = (
	rollover: RolloverConfig | null | undefined,
	showToast = true,
) => {
	const issue = rolloverConfigToIssue({ rollover });
	if (issue && showToast) toast.error(issue);
	return !issue;
};
