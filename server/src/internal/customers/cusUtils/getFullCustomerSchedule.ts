import {
	type FullCustomer,
	type FullCustomerSchedule,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const getFullCustomerSchedule = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}): Promise<FullCustomerSchedule | undefined> => {
	const [schedule] = await ctx.db
		.select()
		.from(schedules)
		.where(
			and(
				eq(schedules.internal_customer_id, internalCustomerId),
				isNull(schedules.internal_entity_id),
			),
		)
		.limit(1);

	if (!schedule) return undefined;

	const phases = await ctx.db
		.select()
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, schedule.id))
		.orderBy(asc(schedulePhases.starts_at));

	return { ...schedule, phases };
};

export const getAllCustomerSchedules = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}): Promise<FullCustomerSchedule[]> => {
	const allSchedules = await ctx.db
		.select()
		.from(schedules)
		.where(eq(schedules.internal_customer_id, internalCustomerId));

	if (allSchedules.length === 0) return [];

	const allPhases = await ctx.db
		.select()
		.from(schedulePhases)
		.where(
			inArray(
				schedulePhases.schedule_id,
				allSchedules.map((schedule) => schedule.id),
			),
		)
		.orderBy(asc(schedulePhases.starts_at));

	return allSchedules.map((schedule) => ({
		...schedule,
		phases: allPhases.filter((phase) => phase.schedule_id === schedule.id),
	}));
};

export const hydrateFullCustomerSchedule = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}) => ({
	...fullCustomer,
	schedule: await getFullCustomerSchedule({
		ctx,
		internalCustomerId: fullCustomer.internal_id,
	}),
});

/** Loads all schedules and attaches them to the customer and its entities. */
export const hydrateCustomerWithSchedules = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}) => {
	const allSchedules = await getAllCustomerSchedules({
		ctx,
		internalCustomerId: fullCustomer.internal_id,
	});

	return {
		...fullCustomer,
		schedule: allSchedules.find((schedule) => !schedule.internal_entity_id),
		entities: fullCustomer.entities?.map((entity) => ({
			...entity,
			schedule:
				allSchedules.find(
					(schedule) => schedule.internal_entity_id === entity.internal_id,
				) ?? undefined,
		})),
	};
};
