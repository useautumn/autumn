import type { ApprovalRule } from "@autumn/shared";
import type {
	ApprovalPrincipal,
	ApprovalVerdict,
	BillingCancelFacts,
	BillingChangeFacts,
	BillingUncancelFacts,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import type { BillingApprovalAction } from "../billingContextToApprovalAction";

export type BillingApprovalFacts =
	| BillingChangeFacts
	| BillingCancelFacts
	| BillingUncancelFacts;

/** What one billing check found. Each step of the check fills the fields it owns. */
export type BillingApprovalOutcome = {
	action: BillingApprovalAction;
	/** Whether a deny blocks the write; false in shadow mode, where it's only logged. */
	enforced: boolean;
	/** The member judged, and the rules that covered the action; absent when nothing could apply. */
	principal?: ApprovalPrincipal;
	rules?: ApprovalRule[];
	verdict?: ApprovalVerdict;
	/** One entry per judged item, only behind the non-prod test header. */
	facts?: BillingApprovalFacts[];
};
