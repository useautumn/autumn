import type { ListEntitiesResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { getOrgEntitiesLimit } from "@/internal/misc/edgeConfig/orgLimitsStore.js";
import { getApiEntityListItem } from "../entityUtils/getApiEntityListItem.js";

export const listEntities = async ({
	ctx,
	customerId,
	limit,
	offset,
	withAutumnId = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	limit?: number;
	offset?: number;
	withAutumnId?: boolean;
}): Promise<ListEntitiesResponse> => {
	const orgLimit = getOrgEntitiesLimit({
		orgId: ctx.org.id,
		orgSlug: ctx.org.slug,
	});
	const responseLimit = Math.min(limit ?? orgLimit, orgLimit);
	const responseOffset = offset ?? 0;
	const { customer, entities, totalCount } =
		await EntityService.listByCustomerId({
			db: ctx.db,
			customerId,
			orgId: ctx.org.id,
			env: ctx.env,
			limit: responseLimit + 1,
			offset: responseOffset,
		});
	const list = entities
		.slice(0, responseLimit)
		.map((entity) => getApiEntityListItem({ entity, customer, withAutumnId }));
	return {
		list,
		total: list.length,
		total_count: totalCount,
		total_filtered_count: totalCount,
		offset: responseOffset,
		limit: responseLimit,
		has_more: entities.length > responseLimit,
	};
};
