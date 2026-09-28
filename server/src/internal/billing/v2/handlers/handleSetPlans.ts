import { billingActions } from "@/internal/billing/v2/actions";
import { createScheduleRoute } from "./createScheduleRoutes";

/** Handle the internal set-plans RPC route. */
export const handleSetPlans = createScheduleRoute({
	action: billingActions.setPlans,
	lockMessage:
		"Set plans already in progress for this customer, try again in a few seconds",
});
