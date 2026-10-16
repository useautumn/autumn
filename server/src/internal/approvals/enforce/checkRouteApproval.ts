import type { ApprovalAction } from "@autumn/shared";
import type { ApprovalFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateApproval } from "@/internal/approvals/evaluate/evaluateApproval";
import { checkApproval } from "./checkApproval";

/** Facts as stored on the decision row: the customer by id, everything else as is. */
const routeFactsToJson = ({ facts }: { facts: ApprovalFacts }) => {
	if (!facts || !("customer" in facts)) return facts;
	const { customer, ...rest } = facts;
	return { customer_id: customer.id, ...rest };
};

/**
 * A non-billing route's approval check, run before it writes. `buildFacts` runs
 * only when a rule covers the action, so routes in orgs without rules pay nothing.
 */
export const checkRouteApproval = <Facts extends ApprovalFacts>({
	ctx,
	action,
	buildFacts,
}: {
	ctx: AutumnContext;
	action: ApprovalAction;
	buildFacts: () => Promise<Facts>;
}) =>
	checkApproval({
		ctx,
		action,
		factsToJson: routeFactsToJson,
		evaluate: () => evaluateApproval({ ctx, action, buildFacts }),
	});
