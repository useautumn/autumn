import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkRouteApproval } from "@/internal/approvals/check/checkRouteApproval";
import { isApprovalsLive } from "@/internal/approvals/evaluate/isApprovalsLive";
import { listRulesForAction } from "@/internal/approvals/evaluate/listRulesForAction";
import { resolveApprovalPrincipal } from "@/internal/approvals/principal/resolveApprovalPrincipal";
import { CusService } from "@/internal/customers/CusService";

/** `customers.get_or_create` is judged only when it would create; returning an existing customer is a read. */
export const checkCustomerCreateApproval = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string | null | undefined;
}) => {
	// Most calls return an existing customer, so look it up only when a rule could apply.
	const ruleCouldApply =
		!ctx.skipApproval &&
		resolveApprovalPrincipal({ ctx }) !== null &&
		isApprovalsLive({ ctx }) &&
		(await listRulesForAction({ ctx, action: "customers.get_or_create" }))
			.length > 0;
	if (!ruleCouldApply) return;

	const existingCustomer = customerId
		? await CusService.get({
				db: ctx.db,
				idOrInternalId: customerId,
				orgId: ctx.org.id,
				env: ctx.env,
			})
		: null;
	if (existingCustomer) return;

	await checkRouteApproval({
		ctx,
		action: "customers.get_or_create",
		buildFacts: async () => null,
	});
};
