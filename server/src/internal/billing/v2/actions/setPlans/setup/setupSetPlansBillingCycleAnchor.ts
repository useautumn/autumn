import type {
	CreateScheduleBillingContext,
	FullCusProduct,
} from "@autumn/shared";
import { setupAnchorResetRefund } from "@/internal/billing/v2/setup/setupAnchorResetRefund";
import { setupBillingCycleAnchor } from "@/internal/billing/v2/setup/setupBillingCycleAnchor";
import { setupResetCycleAnchor } from "@/internal/billing/v2/setup/setupResetCycleAnchor";
import { isAliveAt } from "../timeline/timelineGuards";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { anchorFollowsKeptTrial } from "../utils/anchorFollowsKeptTrial";
import { billingCycleAnchorToApply } from "../utils/billingCycleAnchorToApply";

type SetPlansAnchorFields = Pick<
	CreateScheduleBillingContext,
	"billingCycleAnchorMs" | "resetCycleAnchorMs" | "anchorResetRefund"
>;

/** The running recurring plan whose cycle an anchor reset restarts: a main plan before an add-on. */
const currentRecurringCustomerProduct = ({
	billingContext,
	timeline,
}: {
	billingContext: CreateScheduleBillingContext;
	timeline: SetPlansTimeline;
}): FullCusProduct | undefined => {
	const liveIds = new Set(
		timeline.saved.segments
			.filter(
				(segment) =>
					!segment.lifetime &&
					isAliveAt({ segment, at: billingContext.currentEpochMs }),
			)
			.flatMap(({ rows }) => (rows[0] ? [rows[0].customerProductId] : [])),
	);
	const live = billingContext.fullCustomer.customer_products.filter(({ id }) =>
		liveIds.has(id),
	);
	return live.find(({ product }) => !product.is_add_on) ?? live[0];
};

/**
 * The requested anchor, resolved against the outgoing recurring product. Immediate setup
 * cannot see that product, whose ms-precise starts_at a live subscription keeps.
 */
export const setupSetPlansBillingCycleAnchor = ({
	billingContext,
	timeline,
}: {
	billingContext: CreateScheduleBillingContext;
	timeline: SetPlansTimeline;
}): SetPlansAnchorFields => {
	const { requestedBillingCycleAnchor, requestedProrationBehavior } =
		billingContext;
	const outgoingCustomerProduct = currentRecurringCustomerProduct({
		billingContext,
		timeline,
	});
	const [firstProduct] = billingContext.fullProducts;

	const anchorResetRefund = setupAnchorResetRefund({
		billingCycleAnchor: requestedBillingCycleAnchor,
		prorationBehavior: requestedProrationBehavior,
		outgoingCustomerProduct,
	});

	const anchor = billingCycleAnchorToApply({ billingContext });
	if (anchor === undefined || !firstProduct) {
		return {
			billingCycleAnchorMs: billingContext.billingCycleAnchorMs,
			resetCycleAnchorMs: billingContext.resetCycleAnchorMs,
			anchorResetRefund,
		};
	}

	// A trial anchors the cycle on its end, unless a backdated recreate anchors it after the kept trial.
	const trialEndsAt = anchorFollowsKeptTrial({ billingContext })
		? undefined
		: billingContext.trialContext?.trialEndsAt;
	const billingCycleAnchorMs =
		trialEndsAt ??
		setupBillingCycleAnchor({
			stripeSubscription: billingContext.stripeSubscription,
			customerProduct: outgoingCustomerProduct,
			newFullProduct: firstProduct,
			trialContext: billingContext.trialContext,
			currentEpochMs: billingContext.currentEpochMs,
			requestedBillingCycleAnchor: anchor,
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
