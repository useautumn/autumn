import type { ApplyBillingPlanReply } from "../contracts/applyBillingPlan.js";
import { sendToOwner } from "../routing/sendToOwner.js";
import type { RoutingContext } from "../routing/types/routing.js";
import type { ApplyBillingPlanParams } from "../types/balanceWorkerClient.js";

/** The reply waits for Postgres, so it gets longer than the metered commands' deadline. */
const APPLY_BILLING_PLAN_TIMEOUT_MS = 5_000;

export async function sendApplyBillingPlan({
	ctx,
	request,
	signal,
}: ApplyBillingPlanParams & {
	ctx: RoutingContext;
}): Promise<ApplyBillingPlanReply> {
	return sendToOwner<ApplyBillingPlanReply>({
		ctx: {
			...ctx,
			timeoutMs: Math.max(ctx.timeoutMs, APPLY_BILLING_PLAN_TIMEOUT_MS),
		},
		path: "/v1/apply-billing-plan",
		command: request.command,
		payload: { catalogRows: request.catalogRows },
		signal,
	});
}
