import type { BillingContext } from "@autumn/shared";
import { setPlansPhaseProrations } from "@/internal/billing/v2/providers/stripe/setup/resolveSchedulePhaseProrations";
import { billingPlanToNextCyclePreview } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/billingPlanToNextCyclePreview";
import { requestedAnchorResetProration } from "@/internal/billing/v2/utils/schedulePhaseProration/requestedAnchorResetProration";

export const requestPhaseProrations = (billingContext: BillingContext) =>
	setPlansPhaseProrations({ billingContext }) ??
	requestedAnchorResetProration({ billingContext });

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
