import { type RolloverConfig, rolloverConfigToIssue } from "@autumn/shared";
import { toast } from "sonner";

export const checkRolloverConfigValid = (
	rollover: RolloverConfig | null | undefined,
	showToast = true,
) => {
	const issue = rolloverConfigToIssue({ rollover });
	if (issue && showToast) toast.error(issue);
	return !issue;
};
