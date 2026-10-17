import type { BillingContext, BillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { BillingApprovalAction } from "@/internal/approvals/check/billingContextToApprovalAction";
import type { BillingApprovalFacts } from "@/internal/approvals/check/types/billingApprovalOutcome";
import type { BillingRoute } from "@/internal/approvals/check/types/billingRoute";
import { buildApprovalCustomerFacts } from "@/internal/approvals/facts/customer/buildApprovalCustomerFacts";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import { billingPlanToPreviewResponse } from "@/internal/billing/v2/utils/billingPlanToPreviewResponse";
import { billingContextToEntityFacts } from "./billingContextToEntityFacts";
import { buildBillingCancelFacts } from "./buildBillingCancelFacts";
import { buildBillingChangeFacts } from "./buildBillingChangeFacts";
import { setupApprovalTaxRate } from "./setupApprovalTaxRate";
import { setupCurrentStripeDiscounts } from "./setupCurrentStripeDiscounts";

/** The routes whose preview scopes next_cycle to the request's own Stripe subscription. */
const SUBSCRIPTION_SCOPED_ROUTES: BillingRoute[] = [
	"billing.set_plans",
	"billing.multi_update",
];

/**
 * Facts for a billing check, read from the billing plan through the same totals
 * the preview shows, with the same tax rate, so a preview and its write agree.
 */
export const buildBillingApprovalFacts = async ({
	ctx,
	billingContext: requestBillingContext,
	billingPlan: requestBillingPlan,
	action,
	route,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
	action: BillingApprovalAction;
	route: BillingRoute;
}): Promise<BillingApprovalFacts> => {
	const billingContext = await setupApprovalTaxRate({
		ctx,
		billingContext: requestBillingContext,
	});
	// Writes skip the preview bag, but its tax and invoice credits are part of the totals.
	const billingPlan: BillingPlan = requestBillingPlan.preview
		? requestBillingPlan
		: {
				...requestBillingPlan,
				preview: await computeAttachPreviewBillingPlan({
					ctx,
					billingContext,
					autumnBillingPlan: requestBillingPlan.autumn,
				}),
			};
	const [totals, customer] = await Promise.all([
		billingPlanToPreviewResponse({
			ctx,
			billingContext,
			billingPlan,
			nextCycleStripeSubscriptionId: SUBSCRIPTION_SCOPED_ROUTES.includes(route)
				? billingContext.stripeSubscription?.id
				: undefined,
		}),
		buildApprovalCustomerFacts({
			ctx,
			fullCustomer: billingContext.fullCustomer,
		}),
	]);
	const entity = billingContextToEntityFacts({ billingContext });

	if (action === "billing.cancel" || action === "billing.uncancel") {
		const cancelFacts = buildBillingCancelFacts({
			billingContext,
			billingPlan,
			preview: totals,
			customer,
			entity,
		});
		if (action === "billing.cancel") return cancelFacts;
		return { customer, entity, outgoing: cancelFacts.outgoing };
	}

	return buildBillingChangeFacts({
		ctx,
		billingContext,
		billingPlan,
		preview: totals,
		customer,
		entity,
		currentDiscounts: await setupCurrentStripeDiscounts({
			ctx,
			billingContext,
		}),
	});
};
