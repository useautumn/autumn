import { billingActions } from "@/internal/billing/v2/actions";
import { createScheduleRoute } from "./createScheduleRoutes";

/** Handle the internal create-schedule RPC route. */
export const handleCreateSchedule = createScheduleRoute({
	action: billingActions.createSchedule,
	lockMessage:
		"Create schedule already in progress for this customer, try again in a few seconds",
});
