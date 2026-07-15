import { ErrCode, RecaseError, type SyncBillingContext } from "@autumn/shared";
import { assertSyncCurrencyMatchesCustomer } from "./assertSyncCurrencyMatchesCustomer";

/**
 * Validate sync inputs against the detection result. Throws RecaseError on
 * any unrecoverable problem; otherwise no-op.
 *
 * STUB — checks to add later:
 *   - Mapping plan_ids exist in the catalog
 *   - Each mapping points at a stripe sub/schedule we actually fetched
 *   - Detection PlanWarnings are all in `acknowledgedWarnings`
 *   - Customer has a Stripe id
 */
export const handleSyncErrors = ({
	syncContext,
}: {
	syncContext: SyncBillingContext;
}): void => {
	assertSyncCurrencyMatchesCustomer({ syncContext });

	const immediateEnabledPlans =
		syncContext.immediatePhase?.productContexts.filter(
			(productContext) => productContext.plan.enable_plan_immediately,
		) ?? [];
	const firstFuturePhase = syncContext.futurePhases[0];
	const laterEnabledPlans = syncContext.futurePhases
		.slice(1)
		.flatMap((phase) =>
			phase.productContexts.filter(
				(productContext) => productContext.plan.enable_plan_immediately,
			),
		);
	const firstFutureEnabledPlans =
		firstFuturePhase?.productContexts.filter(
			(productContext) => productContext.plan.enable_plan_immediately,
		) ?? [];
	const hasEnabledPlan =
		immediateEnabledPlans.length > 0 ||
		firstFutureEnabledPlans.length > 0 ||
		laterEnabledPlans.length > 0;

	if (!hasEnabledPlan) return;

	if (syncContext.stripeSubscription || !syncContext.stripeSchedule) {
		throw new RecaseError({
			message:
				"enable_plan_immediately can only be used when syncing a future Stripe schedule without a live subscription",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (immediateEnabledPlans.length > 0 || laterEnabledPlans.length > 0) {
		throw new RecaseError({
			message:
				"enable_plan_immediately can only be used on plans in the first future sync phase",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (
		!firstFuturePhase ||
		firstFuturePhase.startsAt <= syncContext.currentEpochMs
	) {
		throw new RecaseError({
			message:
				"enable_plan_immediately requires the first sync phase to start in the future",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
