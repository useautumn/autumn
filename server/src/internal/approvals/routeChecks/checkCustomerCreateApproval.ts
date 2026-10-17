import type { BillingDetailsParams, CustomerData } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { checkRouteApproval } from "@/internal/approvals/check/checkRouteApproval";
import { isApprovalsLive } from "@/internal/approvals/evaluate/isApprovalsLive";
import { listRulesForAction } from "@/internal/approvals/evaluate/listRulesForAction";
import { buildCustomerChangeFacts } from "@/internal/approvals/facts/customers/buildCustomerChangeFacts";
import { resolveApprovalPrincipal } from "@/internal/approvals/principal/resolveApprovalPrincipal";
import { customerDataToCustomerUpdates } from "@/internal/customers/actions/updateCustomerData";
import { CusService } from "@/internal/customers/CusService";

/** `customers.get_or_create` is judged only when it would create; returning an existing customer is a read. */
export const checkCustomerCreateApproval = async ({
	ctx,
	customerId,
	customerData,
	billingDetails,
}: {
	ctx: AutumnContext;
	customerId: string | null | undefined;
	customerData?: CustomerData;
	billingDetails?: BillingDetailsParams;
}) => {
	// Most calls return an existing customer, so look it up only when a rule could apply.
	if (
		ctx.skipApproval ||
		resolveApprovalPrincipal({ ctx }) === null ||
		!isApprovalsLive({ ctx })
	)
		return;
	const [createRules, updateRules] = await Promise.all([
		listRulesForAction({ ctx, action: "customers.get_or_create" }),
		listRulesForAction({ ctx, action: "customers.update" }),
	]);
	const ruleCouldApply = createRules.length > 0 || updateRules.length > 0;
	if (!ruleCouldApply) return;

	const existingCustomer = customerId
		? await CusService.get({
				db: ctx.db,
				idOrInternalId: customerId,
				orgId: ctx.org.id,
				env: ctx.env,
			})
		: null;
	if (existingCustomer) {
		const updates = customerDataToCustomerUpdates({
			ctx,
			customer: existingCustomer,
			customerData,
		});
		if (Object.keys(updates).length === 0 && !billingDetails) return;

		await checkRouteApproval({
			ctx,
			action: "customers.update",
			buildFacts: () =>
				buildCustomerChangeFacts({
					ctx,
					customerId: existingCustomer.id || existingCustomer.internal_id,
				}),
		});
		return;
	}

	await checkRouteApproval({
		ctx,
		action: "customers.get_or_create",
		buildFacts: async () => null,
	});
};
