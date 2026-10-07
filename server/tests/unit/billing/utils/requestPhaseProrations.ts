import type { BillingContext } from "@autumn/shared";
import { setPlansPhaseProrations } from "@/internal/billing/v2/providers/stripe/setup/resolveSchedulePhaseProrations";
import { billingPlanToNextCyclePreview } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/billingPlanToNextCyclePreview";
import { requestedAnchorResetProration } from "@/internal/billing/v2/utils/schedulePhaseProration/requestedAnchorResetProration";

/** The prorations resolveSchedulePhaseProrations takes from the request, for contexts with no saved or live schedule. */
export const requestPhaseProrations = (billingContext: BillingContext) =>
	setPlansPhaseProrations({ billingContext }) ??
	requestedAnchorResetProration({ billingContext });

/** The next-cycle preview with the prorations its request names, as the preview path resolves them. */
export const previewNextCycle = (
	params: Omit<
		Parameters<typeof billingPlanToNextCyclePreview>[0],
		"phaseProrations"
	>,
) =>
	billingPlanToNextCyclePreview({
		...params,
		phaseProrations: requestPhaseProrations(params.billingContext),
	});
