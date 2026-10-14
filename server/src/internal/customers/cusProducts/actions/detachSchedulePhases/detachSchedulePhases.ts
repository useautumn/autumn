import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeDetachSchedulePhases } from "./computeDetachSchedulePhases";
import { executeDetachSchedulePhases } from "./executeDetachSchedulePhases";

export const detachSchedulePhases = async ({
	ctx,
	fullCustomer,
	schedule,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	schedule: Stripe.SubscriptionSchedule;
}) => {
	const rows = computeDetachSchedulePhases({ fullCustomer, schedule });
	return executeDetachSchedulePhases({ ctx, rows });
};
