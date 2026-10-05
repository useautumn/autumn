import {
	type PhaseProrationBehavior,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { and, eq, isNotNull } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/** Every saved phase of the customer's schedules that names its own proration. */
export const listSchedulePhaseProrations = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: Pick<RepoContext, "db" | "org" | "env">;
	internalCustomerId: string;
}): Promise<{ startsAt: number; prorationBehavior: PhaseProrationBehavior }[]> => {
	const phases = await ctx.db
		.select({
			startsAt: schedulePhases.starts_at,
			prorationBehavior: schedulePhases.proration_behavior,
		})
		.from(schedulePhases)
		.innerJoin(schedules, eq(schedulePhases.schedule_id, schedules.id))
		.where(
			and(
				eq(schedules.org_id, ctx.org.id),
				eq(schedules.env, ctx.env),
				eq(schedules.internal_customer_id, internalCustomerId),
				isNotNull(schedulePhases.proration_behavior),
			),
		);

	return phases.flatMap(({ startsAt, prorationBehavior }) =>
		prorationBehavior ? [{ startsAt, prorationBehavior }] : [],
	);
};
