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
