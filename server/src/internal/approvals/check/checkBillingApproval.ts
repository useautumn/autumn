import { attachTestFacts } from "./attachTestFacts";
import { billingContextToApprovalAction } from "./billingContextToApprovalAction";
import { lazyBillingApprovalFacts } from "./lazyBillingApprovalFacts";
import type { BillingApprovalOutcome } from "./types/billingApprovalOutcome";
import type { CheckBillingApprovalParams } from "./types/checkBillingApprovalParams";

/**
 * The one approval call each billing action makes, after compute and errors, for
 * previews and writes alike. It grows by steps; facts are built once, when a step reads them.
 */
export const checkBillingApproval = async (
	params: CheckBillingApprovalParams,
): Promise<BillingApprovalOutcome> => {
	const { ctx, billingContext, route, preview = false } = params;
	const action = billingContextToApprovalAction({ billingContext, route });
	const outcome: BillingApprovalOutcome = {
		action,
		enforced: ctx.org.config.approvals_enforced,
	};
	const facts = lazyBillingApprovalFacts({ ...params, action });
	if (ctx.skipApproval) return outcome;

	if (preview) await attachTestFacts({ params, outcome, facts });
	return outcome;
};
