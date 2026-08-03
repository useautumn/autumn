import { customerProducts, schedulePhases, schedules } from "@autumn/shared";
import { eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

type ScheduleWithPhases = {
	id: string;
	internal_entity_id: string | null;
	phases: { starts_at: number; customer_product_ids: string[] }[];
};

type ProductScope = {
	id: string;
	internal_entity_id: string | null;
	entity_id: string | null;
};

type ScheduleScope = {
	internalEntityId: string | null;
	entityId: string | null;
};

const CUSTOMER_LEVEL_SCOPE: ScheduleScope = {
	internalEntityId: null,
	entityId: null,
};

const selectProductScopes = async ({
	ctx,
	customerProductIds,
}: {
	ctx: AutumnContext;
	customerProductIds: string[];
}): Promise<ProductScope[]> => {
	if (customerProductIds.length === 0) return [];
	return await ctx.db
		.select({
			id: customerProducts.id,
			internal_entity_id: customerProducts.internal_entity_id,
			entity_id: customerProducts.entity_id,
		})
		.from(customerProducts)
		.where(inArray(customerProducts.id, customerProductIds));
};

const firstPhaseProductIds = (schedule: ScheduleWithPhases): string[] =>
	[...schedule.phases].sort((a, b) => a.starts_at - b.starts_at)[0]
		?.customer_product_ids ?? [];

/**
 * A schedule takes the scope of the first entity-owned plan in its opening
 * phase. Plans in later phases don't affect it.
 */
const findOwningProduct = ({
	customerProductIds,
	products,
}: {
	customerProductIds: string[];
	products: ProductScope[];
}): ProductScope | undefined =>
	customerProductIds
		.map((productId) => products.find((product) => product.id === productId))
		.find((product) => product?.internal_entity_id);

export const resolveCustomerProductsScope = async ({
	ctx,
	customerProductIds,
}: {
	ctx: AutumnContext;
	customerProductIds: string[];
}): Promise<ScheduleScope> => {
	const owner = findOwningProduct({
		customerProductIds,
		products: await selectProductScopes({ ctx, customerProductIds }),
	});
	if (!owner?.internal_entity_id) return CUSTOMER_LEVEL_SCOPE;
	return {
		internalEntityId: owner.internal_entity_id,
		entityId: owner.entity_id,
	};
};

/**
 * Customer products the schedules this request replaces put in place. Only
 * these may be expired when the new phases drop them — anything the schedule
 * never touched is none of its business.
 */
export const resolveReplacedScheduleCustomerProductIds = async ({
	ctx,
	internalCustomerId,
	requestScopes,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	requestScopes: (string | null)[];
}): Promise<string[]> => {
	const customerSchedules = await ctx.db
		.select({
			id: schedules.id,
			internal_entity_id: schedules.internal_entity_id,
		})
		.from(schedules)
		.where(eq(schedules.internal_customer_id, internalCustomerId));

	if (customerSchedules.length === 0) return [];

	const phases = await ctx.db
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
		phases: phases.filter((phase) => phase.schedule_id === schedule.id),
	}));
	const scopes = await resolveScheduleScopes({
		ctx,
		schedules: schedulesWithPhases,
	});

	const requested = new Set(requestScopes);
	const replacedProductIds = schedulesWithPhases
		.filter((schedule) => requested.has(scopes.get(schedule.id) ?? null))
		.flatMap((schedule) =>
			schedule.phases.flatMap((phase) => phase.customer_product_ids),
		);

	return [...new Set(replacedProductIds)];
};

/**
 * Maps each schedule to the entity owning its opening phase, falling back to the
 * stored column only when that phase owns no readable products.
 */
export const resolveScheduleScopes = async ({
	ctx,
	schedules,
}: {
	ctx: AutumnContext;
	schedules: ScheduleWithPhases[];
}): Promise<Map<string, string | null>> => {
	const openingProductIds = new Map(
		schedules.map((schedule) => [schedule.id, firstPhaseProductIds(schedule)]),
	);
	const products = await selectProductScopes({
		ctx,
		customerProductIds: [...new Set([...openingProductIds.values()].flat())],
	});
	const knownIds = new Set(products.map((product) => product.id));

	return new Map(
		schedules.map((schedule) => {
			const customerProductIds = openingProductIds.get(schedule.id) ?? [];
			if (!customerProductIds.some((productId) => knownIds.has(productId))) {
				return [schedule.id, schedule.internal_entity_id ?? null];
			}
			const owner = findOwningProduct({ customerProductIds, products });
			return [schedule.id, owner?.internal_entity_id ?? null];
		}),
	);
};
