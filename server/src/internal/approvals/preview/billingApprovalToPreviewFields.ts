import type { PreviewPermission } from "@autumn/shared";
import type { BillingApprovalOutcome } from "@/internal/approvals/check/types/billingApprovalOutcome";
import { billingFactsToJson } from "@/internal/approvals/facts/billing/billingFactsToJson";

/** A rule-decided verdict as a preview shows it; none when no rule matched. */
const outcomeToPermission = ({
	approval,
}: {
	approval?: BillingApprovalOutcome;
}): PreviewPermission | null => {
	if (!approval?.verdict?.decided_by) return null;
	return {
		...approval.verdict,
		enforced: approval.enforced,
	} as PreviewPermission;
};

/** The approval fields a billing preview carries. Handlers only spread them. */
export const billingApprovalToPreviewFields = ({
	approval,
}: {
	approval?: BillingApprovalOutcome;
}) => {
	const permission = outcomeToPermission({ approval });
	return {
		...(permission && { permission }),
		...(approval?.facts && {
			_permission_facts:
				approval.facts.length === 1
					? billingFactsToJson({ facts: approval.facts[0] })
					: approval.facts.map((facts) => billingFactsToJson({ facts })),
		}),
	};
};
