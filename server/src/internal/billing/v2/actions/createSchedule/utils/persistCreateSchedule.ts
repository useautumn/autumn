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
import {
	resolveCustomerProductsScope,
	resolveScheduleScopes,
} from "@/internal/customers/schedules/resolveScheduleScope";
import { generateId } from "@/utils/genUtils";

/**
 * Finds the schedule occupying the target scope. Scope comes from the opening
 * phase's customer products, so rows with a stale entity column still match.
 */
const getExistingScheduleState = async ({
	ctx,
	internalCustomerId,
	internalEntityId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	internalEntityId: string | null;
}) => {
	const empty = { scheduleIds: [], existingCustomerProductIds: [] };

	const customerSchedules = await ctx.db
		.select({
			id: schedules.id,
			internal_entity_id: schedules.internal_entity_id,
		})
		.from(schedules)
		.where(eq(schedules.internal_customer_id, internalCustomerId));

	if (customerSchedules.length === 0) return empty;

	const existingPhases = await ctx.db
		.select({
			schedule_id: schedulePhases.schedule_id,
			starts_at: schedulePhases.starts_at,
			customer_product_ids: schedulePhases.customer_product_ids,
		})
		.from(schedulePhases)
		.where(
			inArray(
				schedulePhases.schedule_id,
				customerSchedules.map((schedule) => schedule.id),
			),
		);

	const schedulesWithPhases = customerSchedules.map((schedule) => ({
		...schedule,
		phases: existingPhases.filter((phase) => phase.schedule_id === schedule.id),
	}));

	const scopes = await resolveScheduleScopes({
		ctx,
		schedules: schedulesWithPhases,
	});
	const inScope = schedulesWithPhases.filter(
		(schedule) => (scopes.get(schedule.id) ?? null) === internalEntityId,
	);

	if (inScope.length === 0) return empty;

	return {
		scheduleIds: inScope.map((schedule) => schedule.id),
		existingCustomerProductIds: inScope.flatMap((schedule) =>
			schedule.phases.flatMap((phase) => phase.customer_product_ids),
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

		const openingPhase = [...phases].sort((a, b) => a.startsAt - b.startsAt)[0];
		const scope = await resolveCustomerProductsScope({
			ctx: txCtx,
			customerProductIds: openingPhase?.customerProductIds ?? [],
		});

		const existingScheduleState = await getExistingScheduleState({
			ctx: txCtx,
			internalCustomerId: fullCustomer.internal_id,
			internalEntityId: scope.internalEntityId,
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
			internal_entity_id: scope.internalEntityId,
			entity_id: scope.entityId,
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
