import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeHeldSchedulePhases } from "./computeHeldSchedulePhases";
import { executeDropHeldSchedulePhases } from "./executeDropHeldSchedulePhases";

/**
 * Drops what Autumn holds for a Stripe schedule Stripe no longer runs as
 * imported: the scheduled rows for its future phases, and the phase end on
 * the live plan. The subscription webhook applies whatever Stripe does next.
 */
export const dropHeldSchedulePhases = async ({
	ctx,
	fullCustomer,
	schedule,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	schedule: Stripe.SubscriptionSchedule;
}) => {
	const held = computeHeldSchedulePhases({ fullCustomer, schedule });
	return executeDropHeldSchedulePhases({ ctx, held });
};
