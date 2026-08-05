import {
	CusProductStatus,
	customerProducts,
	type FullCustomer,
	type FullCustomerSchedule,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { asc, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resolveScheduleScopes } from "../schedules/utils/resolveScheduleScopes.js";

/** A product is dead once expired or deleted, but phases keep pointing at it either way. */
const selectLiveProductIds = async ({
	ctx,
	customerProductIds,
}: {
	ctx: AutumnContext;
	customerProductIds: string[];
}): Promise<Set<string>> => {
	if (customerProductIds.length === 0) return new Set();

	const products = await ctx.db
		.select({ id: customerProducts.id, status: customerProducts.status })
		.from(customerProducts)
		.where(inArray(customerProducts.id, customerProductIds));

	return new Set(
		products
			.filter((product) => product.status !== CusProductStatus.Expired)
			.map((product) => product.id),
	);
};

/**
 * Schedules with a future phase that still points at a live product. Schedules
 * carry no status of their own, so dates alone don't prove one is pending.
 */
const loadLiveSchedules = async ({
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

	const liveProductIds = await selectLiveProductIds({
		ctx,
		customerProductIds: [
			...new Set(allPhases.flatMap((phase) => phase.customer_product_ids)),
		],
	});

	// Dead ids stay in the phase row forever, so prune them here — consumers
	// resolve each id against the customer and can't tell a dead one from a gap.
	const livePhases = allPhases
		.map((phase) => ({
			...phase,
			customer_product_ids: phase.customer_product_ids.filter((productId) =>
				liveProductIds.has(productId),
			),
		}))
		.filter((phase) => phase.customer_product_ids.length > 0);

	return allSchedules
		.map((schedule) => ({
			...schedule,
			phases: livePhases.filter((phase) => phase.schedule_id === schedule.id),
		}))
		.filter((schedule) =>
			schedule.phases.some((phase) => phase.starts_at > Date.now()),
		);
};

/**
 * Buckets a customer's schedules by scope, derived from the customer products
 * each one owns rather than the schedules row's own entity column.
 */
export const getCustomerSchedulesByScope = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}): Promise<{
	customerSchedule: FullCustomerSchedule | undefined;
	entitySchedules: Record<string, FullCustomerSchedule>;
}> => {
	const liveSchedules = await loadLiveSchedules({ ctx, internalCustomerId });
	const scopes = await resolveScheduleScopes({
		ctx,
		schedules: liveSchedules,
	});

	let customerSchedule: FullCustomerSchedule | undefined;
	const entitySchedules: Record<string, FullCustomerSchedule> = {};

	for (const schedule of liveSchedules) {
		const internalEntityId = scopes.get(schedule.id);
		if (internalEntityId) {
			entitySchedules[internalEntityId] = schedule;
		} else {
			customerSchedule ??= schedule;
		}
	}

	return { customerSchedule, entitySchedules };
};

export const getFullCustomerSchedule = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}): Promise<FullCustomerSchedule | undefined> => {
	const { customerSchedule } = await getCustomerSchedulesByScope({
		ctx,
		internalCustomerId,
	});
	return customerSchedule;
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
	const { customerSchedule, entitySchedules } =
		await getCustomerSchedulesByScope({
			ctx,
			internalCustomerId: fullCustomer.internal_id,
		});

	return {
		...fullCustomer,
		schedule: customerSchedule,
		entities: fullCustomer.entities?.map((entity) => ({
			...entity,
			schedule: entitySchedules[entity.internal_id] ?? undefined,
		})),
	};
};
