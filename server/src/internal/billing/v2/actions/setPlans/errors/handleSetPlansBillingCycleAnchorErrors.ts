import {
	type CreateScheduleBillingContext,
	isOneOffProduct,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { assertFutureBillingCycleAnchor } from "@/internal/billing/v2/common/errors/assertFutureBillingCycleAnchor";
import { invalidSetPlansRequest } from "./invalidSetPlansRequest";
import { setPlansError } from "./setPlansError";

const anchorIsAfter = ({
	anchorMs,
	boundaryMs,
}: {
	anchorMs: number;
	boundaryMs?: number;
}) =>
	boundaryMs !== undefined &&
	truncateMsToSecondPrecision(anchorMs) >
		truncateMsToSecondPrecision(boundaryMs);

export const handleSetPlansBillingCycleAnchorErrors = ({
	billingContext,
	endsAt,
}: {
	billingContext: CreateScheduleBillingContext;
	endsAt?: number;
}) => {
	const { requestedBillingCycleAnchor, currentEpochMs } = billingContext;
	if (requestedBillingCycleAnchor === undefined) return;

	assertFutureBillingCycleAnchor({
		requestedBillingCycleAnchor,
		currentEpochMs,
	});

	if (
		billingContext.fullProducts.every((product) => isOneOffProduct({ product }))
	) {
		throw invalidSetPlansRequest(
			"billing_cycle_anchor is not supported when every plan is one-off. One-off plans do not have a recurring billing cycle.",
		);
	}

	if (typeof requestedBillingCycleAnchor !== "number") return;

	if (
		endsAt !== undefined &&
		anchorIsAfter({ anchorMs: requestedBillingCycleAnchor, boundaryMs: endsAt })
	) {
		throw setPlansError({
			details: {
				type: "date_order",
				date: "billing_cycle_anchor",
				date_ms: requestedBillingCycleAnchor,
				boundary: "end_date",
				boundary_ms: endsAt,
			},
		});
	}

	const resetsLiveSubscription =
		billingContext.stripeSubscription !== undefined;
	const nextPhaseStartsAt = billingContext.futurePhases[0]?.starts_at;
	if (
		resetsLiveSubscription &&
		nextPhaseStartsAt !== undefined &&
		anchorIsAfter({
			anchorMs: requestedBillingCycleAnchor,
			boundaryMs: nextPhaseStartsAt,
		})
	) {
		throw setPlansError({
			details: {
				type: "date_order",
				date: "billing_cycle_anchor",
				date_ms: requestedBillingCycleAnchor,
				boundary: "next_phase",
				boundary_ms: nextPhaseStartsAt,
			},
		});
	}
};
