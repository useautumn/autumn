import {
	type CreateScheduleParamsV0,
	CusProductStatus,
	customerProducts,
	type FullCustomer,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { generateId } from "@/utils/genUtils";
import type { MaterializedScheduledPhase } from "./materializeScheduledPhases";

const getExistingScheduleState = async ({
	ctx,
	internalCustomerId,
	internalEntityId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	internalEntityId?: string;
}) => {
	const existingSchedules = await ctx.db
		.select({ id: schedules.id })
		.from(schedules)
		.where(
			and(
				eq(schedules.internal_customer_id, internalCustomerId),
				internalEntityId
					? eq(schedules.internal_entity_id, internalEntityId)
					: isNull(schedules.internal_entity_id),
			),
		);

	if (existingSchedules.length === 0) {
		return {
			scheduleIds: [],
			existingCustomerProductIds: [],
		};
	}

	const scheduleIds = existingSchedules.map((schedule) => schedule.id);
	const existingPhases = await ctx.db
		.select({ customer_product_ids: schedulePhases.customer_product_ids })
		.from(schedulePhases)
		.where(inArray(schedulePhases.schedule_id, scheduleIds));
	const existingCustomerProductIds = existingPhases.flatMap(
		(phase) => phase.customer_product_ids,
	);

	return {
		scheduleIds,
		existingCustomerProductIds,
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

const loadPreservedPastPhases = async ({
	ctx,
	internalCustomerId,
	internalEntityId,
	preservePastPhasesBefore,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	internalEntityId?: string;
	preservePastPhasesBefore: number;
}) => {
	const existingSchedules = await ctx.db
		.select({ id: schedules.id })
		.from(schedules)
		.where(
			and(
				eq(schedules.internal_customer_id, internalCustomerId),
				internalEntityId
					? eq(schedules.internal_entity_id, internalEntityId)
					: isNull(schedules.internal_entity_id),
			),
		);

	if (existingSchedules.length === 0) return [];

	const existingPhases = await ctx.db
		.select({
			starts_at: schedulePhases.starts_at,
			customer_product_ids: schedulePhases.customer_product_ids,
		})
		.from(schedulePhases)
		.where(
			and(
				inArray(
					schedulePhases.schedule_id,
					existingSchedules.map((schedule) => schedule.id),
				),
				lt(schedulePhases.starts_at, preservePastPhasesBefore),
			),
		);

	const dedupedPhases = new Map<number, string[]>();

	for (const phase of existingPhases) {
		if (phase.starts_at >= preservePastPhasesBefore) continue;
		if (dedupedPhases.has(phase.starts_at)) continue;
		dedupedPhases.set(phase.starts_at, phase.customer_product_ids);
	}

	return [...dedupedPhases.entries()]
		.sort(([startsAtA], [startsAtB]) => startsAtA - startsAtB)
		.map(([starts_at, customer_product_ids]) => ({
			phase_id: generateId("phase"),
			starts_at,
			customer_product_ids,
		}));
};

/** Persist the schedule rows and scheduled customer products. */
export const persistCreateSchedule = async ({
	ctx,
	params,
	currentEpochMs,
	fullCustomer,
	preservePastPhasesBefore,
	immediatePhaseStartsAt,
	immediatePhaseCustomerProductIds,
	futureScheduledPhases,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	currentEpochMs: number;
	fullCustomer: FullCustomer;
	preservePastPhasesBefore: number;
	immediatePhaseStartsAt: number;
	immediatePhaseCustomerProductIds: string[];
	futureScheduledPhases: MaterializedScheduledPhase[];
}) => {
	return await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		const txCtx = { ...ctx, db: txDb };
		const preservedPastPhases = await loadPreservedPastPhases({
			ctx: txCtx,
			internalCustomerId: fullCustomer.internal_id,
			internalEntityId: fullCustomer.entity?.internal_id ?? undefined,
			preservePastPhasesBefore,
		});

		const existingScheduleState = await getExistingScheduleState({
			ctx: txCtx,
			internalCustomerId: fullCustomer.internal_id,
			internalEntityId: fullCustomer.entity?.internal_id ?? undefined,
		});

		const scheduleId = generateId("sched");
		await txDb.insert(schedules).values({
			id: scheduleId,
			org_id: ctx.org.id,
			env: ctx.env,
			internal_customer_id: fullCustomer.internal_id,
			customer_id: params.customer_id,
			internal_entity_id: fullCustomer.entity?.internal_id ?? null,
			entity_id: fullCustomer.entity?.id ?? null,
			created_at: currentEpochMs,
		});

		const insertedPhases = [
			...preservedPastPhases,
			{
				phase_id: generateId("phase"),
				starts_at: immediatePhaseStartsAt,
				customer_product_ids: immediatePhaseCustomerProductIds,
			},
			...futureScheduledPhases.map((phase) => ({
				phase_id: generateId("phase"),
				starts_at: phase.starts_at,
				customer_product_ids: phase.customerProducts.map(
					(customerProduct) => customerProduct.id,
				),
			})),
		];

		await txDb.insert(schedulePhases).values(
			insertedPhases.map((phase) => ({
				id: phase.phase_id,
				schedule_id: scheduleId,
				starts_at: phase.starts_at,
				customer_product_ids: phase.customer_product_ids,
				created_at: currentEpochMs,
			})),
		);

		await deleteExistingSchedules({
			ctx: txCtx,
			...existingScheduleState,
		});

		return {
			scheduleId,
			insertedPhases,
		};
	});
};
