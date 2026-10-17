import { billingApprovalItemFacts } from "./billingApprovalItemFacts";
import type {
	BillingApprovalFacts,
	BillingApprovalOutcome,
} from "./types/billingApprovalOutcome";
import type { CheckBillingApprovalParams } from "./types/checkBillingApprovalParams";

/** Facts reach a preview only behind the non-prod test header, one entry per judged item. */
export const attachTestFacts = async ({
	params,
	outcome,
	facts,
}: {
	params: CheckBillingApprovalParams;
	outcome: BillingApprovalOutcome;
	facts: () => Promise<BillingApprovalFacts>;
}) => {
	if (!params.ctx.testOptions?.includePermissionFacts) return;
	outcome.facts = billingApprovalItemFacts({ params, facts: await facts() });
};
