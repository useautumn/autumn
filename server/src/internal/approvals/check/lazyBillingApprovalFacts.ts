import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildBillingApprovalFacts } from "@/internal/approvals/facts/billing/buildBillingApprovalFacts";
import type { BillingApprovalAction } from "./billingContextToApprovalAction";
import type { BillingApprovalFacts } from "./types/billingApprovalOutcome";
import type { CheckBillingApprovalParams } from "./types/checkBillingApprovalParams";

/** The check's facts, built on first read and shared by every step after it. */
export const lazyBillingApprovalFacts = ({
	ctx,
	billingContext,
	billingPlan,
	route,
	action,
}: CheckBillingApprovalParams & {
	ctx: AutumnContext;
	action: BillingApprovalAction;
}): (() => Promise<BillingApprovalFacts>) => {
	let facts: Promise<BillingApprovalFacts> | undefined;
	return () => {
		facts ??= buildBillingApprovalFacts({
			ctx,
			billingContext,
			billingPlan,
			action,
			route,
		});
		return facts;
	};
};
