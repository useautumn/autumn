import {
	type CreateScheduleParamsV0,
	CusProductStatus,
	customerProducts,
	type FullCustomer,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";

/**
 * A customer holds one schedule, so a new one replaces everything queued. Scope
 * lives on the plans inside the phases, never on the schedule itself.
 */
const getExistingScheduleState = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}) => {
	const empty = { scheduleIds: [], existingCustomerProductIds: [] };

	const customerSchedules = await ctx.db
		.select({ id: schedules.id })
		.from(schedules)
		.where(eq(schedules.internal_customer_id, internalCustomerId));

	if (customerSchedules.length === 0) return empty;

	const scheduleIds = customerSchedules.map((schedule) => schedule.id);
	const existingPhases = await ctx.db
		.select({ customer_product_ids: schedulePhases.customer_product_ids })
		.from(schedulePhases)
		.where(inArray(schedulePhases.schedule_id, scheduleIds));

	return {
		scheduleIds,
		existingCustomerProductIds: existingPhases.flatMap(
			(phase) => phase.customer_product_ids,
		),
	};
};

/** Remove an existing schedule and any scheduled products it owns. */
const deleteExistingSchedules = async ({
	ctx,
	scheduleIds,
	existingCustomerProductIds,
}: {
	ctx: AutumnContext;
	scheduleIds: string[];
	existingCustomerProductIds: string[];
}) => {
	if (scheduleIds.length === 0) return;

	if (existingCustomerProductIds.length > 0) {
		await ctx.db
			.delete(customerProducts)
			.where(
				and(
					inArray(customerProducts.id, existingCustomerProductIds),
					eq(customerProducts.status, CusProductStatus.Scheduled),
				),
			);
	}

	await ctx.db.delete(schedules).where(inArray(schedules.id, scheduleIds));
};

/** Persist the schedule rows and scheduled customer products. */
export const persistCreateSchedule = async ({
	ctx,
	customerId,
	currentEpochMs,
	fullCustomer,
	phases,
}: {
	ctx: AutumnContext;
	customerId: CreateScheduleParamsV0["customer_id"];
	currentEpochMs: number;
	fullCustomer: FullCustomer;
	phases: { startsAt: number; customerProductIds: string[] }[];
}) => {
	return await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		const txCtx = { ...ctx, db: txDb };

		const existingScheduleState = await getExistingScheduleState({
			ctx: txCtx,
			internalCustomerId: fullCustomer.internal_id,
		});

		await deleteExistingSchedules({
			ctx: txCtx,
			...existingScheduleState,
		});

		const scheduleId = generateId("sched");
		await txDb.insert(schedules).values({
			id: scheduleId,
			org_id: ctx.org.id,
			env: ctx.env,
			internal_customer_id: fullCustomer.internal_id,
			customer_id: customerId,
			internal_entity_id: null,
			entity_id: null,
			created_at: currentEpochMs,
		});

		const insertedPhases = phases.map((phase) => ({
			phase_id: generateId("phase"),
			starts_at: phase.startsAt,
			customer_product_ids: phase.customerProductIds,
		}));

		await txDb.insert(schedulePhases).values(
			insertedPhases.map((phase) => ({
				id: phase.phase_id,
				schedule_id: scheduleId,
				starts_at: phase.starts_at,
				customer_product_ids: phase.customer_product_ids,
				created_at: currentEpochMs,
			})),
		);

		return {
			scheduleId,
			insertedPhases,
		};
	});
};
