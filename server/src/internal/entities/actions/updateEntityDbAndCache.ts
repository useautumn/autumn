import type { Entity } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { updateEntityInCache } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/updateEntityInCache.js";

export const updateEntityDbAndCache = async ({
	ctx,
	customerId,
	entity,
	updates,
}: {
	ctx: AutumnContext;
	customerId: string;
	entity: Entity;
	updates: Partial<Pick<Entity, "spend_limits">>;
}) => {
	const filteredUpdates = Object.fromEntries(
		Object.entries(updates).filter(([, value]) => value !== undefined),
	) as Partial<Pick<Entity, "spend_limits">>;

	if (Object.keys(filteredUpdates).length === 0) {
		return entity;
	}

	const updatedEntity = await EntityService.update({
		db: ctx.db,
		internalId: entity.internal_id,
		update: filteredUpdates,
	});

	await updateEntityInCache({
		ctx,
		customerId,
		idOrInternalId: entity.id ?? entity.internal_id,
		updates: filteredUpdates,
	});

	return updatedEntity;
};
