import { combineApprovalVerdicts } from "@/internal/approvals/evaluate/combineApprovalVerdicts";
import { evaluateApproval } from "@/internal/approvals/evaluate/evaluateApproval";
import { billingApprovalItemFacts } from "./billingApprovalItemFacts";
import type {
	BillingApprovalFacts,
	BillingApprovalOutcome,
} from "./types/billingApprovalOutcome";
import type { CheckBillingApprovalParams } from "./types/checkBillingApprovalParams";

/** Fills the member, their rules and the verdict; left empty when nothing can apply. Any denied item denies. */
export const evaluateBillingApproval = async ({
	params,
	outcome,
	facts,
}: {
	params: CheckBillingApprovalParams;
	outcome: BillingApprovalOutcome;
	facts: () => Promise<BillingApprovalFacts>;
}) => {
	const evaluation = await evaluateApproval({
		ctx: params.ctx,
		action: outcome.action,
		buildFacts: facts,
		splitFacts: (all: BillingApprovalFacts) =>
			billingApprovalItemFacts({ params, facts: all }),
	});
	if (!evaluation) return;

	outcome.principal = evaluation.principal;
	outcome.rules = evaluation.rules;
	outcome.verdict = combineApprovalVerdicts({ verdicts: evaluation.verdicts });
};
