import {
	type AutumnBillingPlan,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

type Replacement = NonNullable<
	AutumnBillingPlan["schedulePhaseCustomerProductReplacements"]
>[number];

const applyReplacements = ({
	customerProductIds,
	replacements,
}: {
	customerProductIds: string[];
	replacements: Replacement[];
}): string[] => {
	const replaced = customerProductIds.flatMap((customerProductId) => {
		const replacement = replacements.find(
			(candidate) => candidate.oldCustomerProductId === customerProductId,
		);
		if (!replacement) return [customerProductId];
		return replacement.newCustomerProductId
			? [replacement.newCustomerProductId]
			: [];
	});

	return [...new Set(replaced)];
};

/**
 * Drop phases the replacements emptied, then any schedule with nothing left to
 * do — one whose remaining phases have all started is spent, and consumers
 * already read it as gone. Phases cascade with the schedule.
 */
const pruneSpentSchedules = async ({
	ctx,
	scheduleIds,
}: {
	ctx: RepoContext;
	scheduleIds: string[];
}) => {
	if (scheduleIds.length === 0) return;

	await ctx.db
		.delete(schedulePhases)
		.where(
			and(
				inArray(schedulePhases.schedule_id, scheduleIds),
				sql`cardinality(${schedulePhases.customer_product_ids}) = 0`,
			),
		);

	const remainingPhases = await ctx.db
		.select({
			schedule_id: schedulePhases.schedule_id,
			starts_at: schedulePhases.starts_at,
		})
		.from(schedulePhases)
		.where(inArray(schedulePhases.schedule_id, scheduleIds));

	const now = Date.now();
	const liveScheduleIds = [
		...new Set(
			remainingPhases
				.filter((phase) => phase.starts_at > now)
				.map((phase) => phase.schedule_id),
		),
	];

	await ctx.db
		.delete(schedules)
		.where(
			liveScheduleIds.length > 0
				? and(
						inArray(schedules.id, scheduleIds),
						notInArray(schedules.id, liveScheduleIds),
					)
				: inArray(schedules.id, scheduleIds),
		);
};

export const replaceScheduledPhaseCustomerProductIds = async ({
	ctx,
	replacements,
}: {
	ctx: RepoContext;
	replacements?: AutumnBillingPlan["schedulePhaseCustomerProductReplacements"];
}) => {
	if (!replacements?.length) return;

	// Keyed by customer alone: a customer product id already identifies the phase
	// entry to swap, so narrowing by the schedule's entity can only miss.
	const byCustomer = new Map<string, Replacement[]>();
	for (const replacement of replacements) {
		const { internalCustomerId } = replacement;
		byCustomer.set(internalCustomerId, [
			...(byCustomer.get(internalCustomerId) ?? []),
			replacement,
		]);
	}

	const touchedScheduleIds = new Set<string>();

	for (const [internalCustomerId, customerReplacements] of byCustomer) {
		const phases = await ctx.db
			.select({
				id: schedulePhases.id,
				scheduleId: schedulePhases.schedule_id,
				customerProductIds: schedulePhases.customer_product_ids,
			})
			.from(schedulePhases)
			.innerJoin(schedules, eq(schedulePhases.schedule_id, schedules.id))
			.where(
				and(
					eq(schedules.org_id, ctx.org.id),
					eq(schedules.env, ctx.env),
					eq(schedules.internal_customer_id, internalCustomerId),
				),
			);

		await Promise.all(
			phases
				.map((phase) => ({
					phase,
					customerProductIds: applyReplacements({
						customerProductIds: phase.customerProductIds,
						replacements: customerReplacements,
					}),
				}))
				.filter(
					({ phase, customerProductIds }) =>
						customerProductIds.join() !== phase.customerProductIds.join(),
				)
				.map(({ phase, customerProductIds }) => {
					touchedScheduleIds.add(phase.scheduleId);
					return ctx.db
						.update(schedulePhases)
						.set({ customer_product_ids: customerProductIds })
						.where(eq(schedulePhases.id, phase.id));
				}),
		);
	}

	await pruneSpentSchedules({
		ctx,
		scheduleIds: [...touchedScheduleIds],
	});
};
