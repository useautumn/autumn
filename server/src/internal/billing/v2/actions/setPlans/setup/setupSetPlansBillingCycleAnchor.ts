import type {
	CreateScheduleBillingContext,
	SetPlansParamsV0,
} from "@autumn/shared";
import { setupAnchorResetRefund } from "@/internal/billing/v2/setup/setupAnchorResetRefund";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import { resolveSetPlansRecurringProducts } from "../utils/resolveSetPlansRecurringProducts";

type SetPlansAnchorFields = Pick<
	CreateScheduleBillingContext,
	"billingCycleAnchorMs" | "resetCycleAnchorMs" | "anchorResetRefund"
>;

/**
 * The requested anchor, resolved against the outgoing recurring product. Immediate setup
 * cannot see that product, whose ms-precise starts_at a live subscription keeps.
 */
export const setupSetPlansBillingCycleAnchor = ({
	billingContext,
	params,
}: {
	billingContext: CreateScheduleBillingContext;
	params: SetPlansParamsV0;
}): SetPlansAnchorFields => {
	const { recurringActive } = resolveSetPlansRecurringProducts({
		billingContext,
	});
	const [outgoingCustomerProduct] = recurringActive;
	const [firstProduct] = billingContext.fullProducts;

	const anchorResetRefund = setupAnchorResetRefund({
		billingCycleAnchor: params.billing_cycle_anchor,
		prorationBehavior: params.proration_behavior,
		outgoingCustomerProduct,
	});

	if (params.billing_cycle_anchor === undefined || !firstProduct) {
		return {
			billingCycleAnchorMs: billingContext.billingCycleAnchorMs,
			resetCycleAnchorMs: billingContext.resetCycleAnchorMs,
			anchorResetRefund,
		};
	}

	const trialEndsAt = billingContext.trialContext?.trialEndsAt;
	const billingCycleAnchorMs =
		trialEndsAt ??
		setupBillingCycleAnchor({
			stripeSubscription: billingContext.stripeSubscription,
			customerProduct: outgoingCustomerProduct,
			newFullProduct: firstProduct,
			trialContext: billingContext.trialContext,
			currentEpochMs: billingContext.currentEpochMs,
			requestedBillingCycleAnchor: params.billing_cycle_anchor,
		});

	return {
		billingCycleAnchorMs,
		resetCycleAnchorMs: setupResetCycleAnchor({
			billingCycleAnchorMs,
			customerProduct: undefined,
			newFullProduct: firstProduct,
		}),
		anchorResetRefund,
	};
};
