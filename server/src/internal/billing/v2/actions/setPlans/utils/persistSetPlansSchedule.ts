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
import { mergePreservedSchedulePhases } from "../subscriptionScope/mergePreservedSchedulePhases";

/**
 * A customer holds one schedule, so a new one replaces everything queued. Scope
 * lives on the plans inside the phases, never on the schedule itself.
 */
export const getExistingScheduleState = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}) => {
	const empty = {
		scheduleIds: [],
		existingCustomerProductIds: [],
		existingPhases: [],
	};

	const customerSchedules = await ctx.db
		.select({ id: schedules.id })
		.from(schedules)
		.where(eq(schedules.internal_customer_id, internalCustomerId));

	if (customerSchedules.length === 0) return empty;

	const scheduleIds = customerSchedules.map((schedule) => schedule.id);
	const existingPhases = await ctx.db
		.select({
			starts_at: schedulePhases.starts_at,
			customer_product_ids: schedulePhases.customer_product_ids,
		})
		.from(schedulePhases)
		.where(inArray(schedulePhases.schedule_id, scheduleIds));

	return {
		scheduleIds,
		existingCustomerProductIds: existingPhases.flatMap(
			(phase) => phase.customer_product_ids,
		),
		existingPhases: existingPhases.map((phase) => ({
			startsAt: phase.starts_at,
			customerProductIds: phase.customer_product_ids,
		})),
	};
};

/** Sync still owns its scheduled rows here; set_plans deletes them in its billing plan. */
const deleteDroppedScheduledCustomerProducts = async ({
	ctx,
	existingCustomerProductIds,
	keptCustomerProductIds,
}: {
	ctx: AutumnContext;
	existingCustomerProductIds: string[];
	keptCustomerProductIds: Set<string>;
}) => {
	const droppedCustomerProductIds = existingCustomerProductIds.filter(
		(customerProductId) => !keptCustomerProductIds.has(customerProductId),
	);
	if (droppedCustomerProductIds.length === 0) return;

	await ctx.db
		.delete(customerProducts)
		.where(
			and(
				inArray(customerProducts.id, droppedCustomerProductIds),
				eq(customerProducts.status, CusProductStatus.Scheduled),
			),
		);
};

/** Replace the customer's schedule rows with these phases, keeping out-of-scope plans' phases. */
export const persistSetPlansSchedule = async ({
	ctx,
	customerId,
	currentEpochMs,
	fullCustomer,
	phases,
	preservedCustomerProductIds = [],
	deleteDroppedScheduledRows = false,
}: {
	ctx: AutumnContext;
	customerId: CreateScheduleParamsV0["customer_id"];
	currentEpochMs: number;
	fullCustomer: FullCustomer;
	phases: { startsAt: number; customerProductIds: string[] }[];
	preservedCustomerProductIds?: string[];
	deleteDroppedScheduledRows?: boolean;
}) => {
	return await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		const txCtx = { ...ctx, db: txDb };

		const existingScheduleState = await getExistingScheduleState({
			ctx: txCtx,
			internalCustomerId: fullCustomer.internal_id,
		});

		const persistedPhases = mergePreservedSchedulePhases({
			phases,
			existingPhases: existingScheduleState.existingPhases,
			preservedCustomerProductIds: new Set(preservedCustomerProductIds),
		});

		if (deleteDroppedScheduledRows) {
			await deleteDroppedScheduledCustomerProducts({
				ctx: txCtx,
				existingCustomerProductIds:
					existingScheduleState.existingCustomerProductIds,
				keptCustomerProductIds: new Set(
					persistedPhases.flatMap((phase) => phase.customerProductIds),
				),
			});
		}
		if (existingScheduleState.scheduleIds.length > 0) {
			await txDb
				.delete(schedules)
				.where(inArray(schedules.id, existingScheduleState.scheduleIds));
		}

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

		const insertedPhases = persistedPhases.map((phase) => ({
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
