import { billingActions } from "@/internal/billing/v2/actions";
import { createSchedulePreviewRoute } from "./createScheduleRoutes";

export const handlePreviewSetPlans = createSchedulePreviewRoute({
	action: billingActions.previewSetPlans,
});
