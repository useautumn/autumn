import { type Entity, entities } from "@autumn/shared";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** A customer's entities with these ids, plus its id-less row (the one a request can claim). */
export const listEntitiesById = async ({
	ctx,
	internalCustomerId,
	entityIds,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	entityIds: string[];
}): Promise<Entity[]> => {
	const rows = await ctx.db
		.select()
		.from(entities)
		.where(
			and(
				eq(entities.internal_customer_id, internalCustomerId),
				or(inArray(entities.id, entityIds), isNull(entities.id)),
			),
		);
	return rows as Entity[];
};
