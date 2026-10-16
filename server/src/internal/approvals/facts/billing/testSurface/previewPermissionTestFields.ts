import type {
	ApprovalAction,
	BillingContext,
	BillingPlan,
} from "@autumn/shared";
import {
	type ApprovalPrincipal,
	evaluateApprovalRules,
} from "@autumn/shared/api/approvals/evaluate/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveApprovalsEnv } from "@/internal/approvals/evaluate/resolveApprovalsEnv";
import { billingFactsToJson } from "../billingFactsToJson";
import { billingPlanToActionFacts } from "../billingPlanToActionFacts";
import type { BillingPreviewTotals } from "../billingPreviewTotals";
import { parsePermissionFactsHeader } from "./parsePermissionFactsHeader";

/**
 * Test-only preview fields, behind `x-include-permission-facts`: the facts the
 * request would be checked against, and the verdict for the header's inline rules.
 */
export const previewPermissionTestFields = async ({
	ctx,
	billingContext,
	billingPlan,
	preview,
	action,
	nextCycleStripeSubscriptionId,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	preview: BillingPreviewTotals;
	action: ApprovalAction;
	nextCycleStripeSubscriptionId?: string;
}) => {
	const header = ctx.testOptions?.includePermissionFacts;
	if (!header) return {};
	const testOptions = parsePermissionFactsHeader({ header });

	const facts = await billingPlanToActionFacts({
		ctx,
		billingContext,
		billingPlan,
		action,
		preview,
		nextCycleStripeSubscriptionId,
	});
	const principal: ApprovalPrincipal = testOptions.principal ?? {
		type: "api_key",
		key_id: ctx.apiKeyId ?? "unknown",
	};

	return {
		_permission_facts: billingFactsToJson({ facts }),
		_permission: evaluateApprovalRules({
			principal,
			action,
			facts,
			rules: testOptions.rules,
			env: resolveApprovalsEnv({ ctx }),
		}),
	};
};
