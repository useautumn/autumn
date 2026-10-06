import type { BillingContext } from "@autumn/shared";
import { setPlansPhaseProrations } from "@/internal/billing/v2/providers/stripe/setup/resolveSchedulePhaseProrations";
import { requestedAnchorResetProration } from "@/internal/billing/v2/utils/schedulePhaseProration/requestedAnchorResetProration";

/** The prorations resolveSchedulePhaseProrations takes from the request, for contexts with no saved or live schedule. */
export const requestPhaseProrations = (billingContext: BillingContext) =>
	setPlansPhaseProrations({ billingContext }) ??
	requestedAnchorResetProration({ billingContext });
