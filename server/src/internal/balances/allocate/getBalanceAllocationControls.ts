import {
	type BalanceAllocationControl,
	type BalanceAllocations,
	entIntvToResetIntv,
	entities,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const getBalanceAllocationControls = async ({
	ctx,
	internalCustomerId,
	allocations,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	allocations: BalanceAllocations | null | undefined;
}): Promise<BalanceAllocationControl[] | undefined> => {
	const internalEntityIds = [
		...new Set(
			Object.values(allocations ?? {}).flatMap((allocation) =>
				Object.keys(allocation.amounts),
			),
		),
	];
	if (internalEntityIds.length === 0) return undefined;
	const rows = await ctx.db
		.select({ id: entities.id, internalId: entities.internal_id })
		.from(entities)
		.where(
			and(
				eq(entities.org_id, ctx.org.id),
				eq(entities.env, ctx.env),
				eq(entities.internal_customer_id, internalCustomerId),
				inArray(entities.internal_id, internalEntityIds),
			),
		);
	const entityIds = new Map(rows.map((row) => [row.internalId, row.id]));
	return Object.values(allocations ?? {}).map((allocation) => ({
		feature_id: allocation.feature_id,
		interval: entIntvToResetIntv({ entInterval: allocation.interval }),
		allocations: Object.entries(allocation.amounts).flatMap(([id, amount]) => {
			const entityId = entityIds.get(id);
			return entityId == null ? [] : [{ entity_id: entityId, amount }];
		}),
	}));
};
