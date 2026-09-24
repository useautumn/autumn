import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeDetachSchedulePhases } from "./computeDetachSchedulePhases";
import { executeDetachSchedulePhases } from "./executeDetachSchedulePhases";

/**
 * Detaches Autumn's rows from a Stripe schedule Stripe no longer runs as
 * imported: the scheduled rows for its future phases come off, and the phase
 * end on the live plan is cleared. The subscription webhook applies whatever
 * Stripe does next.
 */
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
