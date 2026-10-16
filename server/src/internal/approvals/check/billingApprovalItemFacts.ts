import type { MultiAttachBillingContext } from "@autumn/shared";
import type { BillingChangeFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import { splitMultiAttachFacts } from "@/internal/approvals/facts/billing/splitMultiAttachFacts";
import type { BillingApprovalFacts } from "./types/billingApprovalOutcome";
import type { CheckBillingApprovalParams } from "./types/checkBillingApprovalParams";

/** The facts each judged item sees. A request is one item, except a multi-attach: */
export const billingApprovalItemFacts = ({
	params: { billingContext, route },
	facts,
}: {
	params: CheckBillingApprovalParams;
	facts: BillingApprovalFacts;
}): BillingApprovalFacts[] => {
	if (route !== "billing.multi_attach") return [facts];
	// each plan is judged on its own entity, so one plan's scope can't stand in for another's.
	return splitMultiAttachFacts({
		facts: facts as BillingChangeFacts,
		billingContext: billingContext as MultiAttachBillingContext,
	});
};
