import type { Entity } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";

export const updateEntityDbAndCache = async ({
	ctx,
	entity,
	updates,
}: {
	ctx: AutumnContext;
	entity: Entity;
	updates: Partial<
		Pick<Entity, "spend_limits" | "usage_alerts" | "overage_allowed">
	>;
}) => {
	const filteredUpdates = Object.fromEntries(
		Object.entries(updates).filter(([, value]) => value !== undefined),
	) as Partial<
		Pick<Entity, "spend_limits" | "usage_alerts" | "overage_allowed">
	>;

	if (Object.keys(filteredUpdates).length === 0) {
		return entity;
	}

	return EntityService.update({
		db: ctx.db,
		internalId: entity.internal_id,
		update: filteredUpdates,
	});
};
