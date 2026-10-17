import type { BillingApprovalOutcome } from "@/internal/approvals/check/types/billingApprovalOutcome";
import { combineApprovalVerdicts } from "@/internal/approvals/evaluate/combineApprovalVerdicts";
import { billingApprovalToPreviewFields } from "./billingApprovalToPreviewFields";

/** A preview of several updates: one verdict for the request (any deny decides), facts per update. */
export const billingApprovalsToPreviewFields = ({
	approvals,
}: {
	approvals: BillingApprovalOutcome[];
}) => {
	const [first] = approvals;
	const verdicts = approvals.flatMap(({ verdict }) =>
		verdict ? [verdict] : [],
	);
	const itemFacts = approvals.flatMap(
		(approval) =>
			billingApprovalToPreviewFields({ approval })._permission_facts ?? [],
	);
	const { permission } = billingApprovalToPreviewFields({
		approval:
			first && verdicts.length > 0
				? { ...first, verdict: combineApprovalVerdicts({ verdicts }) }
				: undefined,
	});
	return {
		...(permission && { permission }),
		...(itemFacts.length > 0 && { _permission_facts: itemFacts }),
	};
};
