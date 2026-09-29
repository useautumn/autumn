import {
	CustomerNotFoundError,
	EntityNotFoundError,
	entities,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "../CusService.js";
import type { ListScope } from "./types/listScope.js";

export const resolveListScope = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
}): Promise<ListScope> => {
	if (!customerId) return { internalCustomerId: null, internalEntityId: null };

	const customer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	if (!customer) throw new CustomerNotFoundError({ customerId });
	if (!entityId) {
		return { internalCustomerId: customer.internal_id, internalEntityId: null };
	}

	const entity = await ctx.db.query.entities.findFirst({
		where: and(
			eq(entities.id, entityId),
			eq(entities.internal_customer_id, customer.internal_id),
		),
	});
	if (!entity) throw new EntityNotFoundError({ entityId });

	return {
		internalCustomerId: customer.internal_id,
		internalEntityId: entity.internal_id,
	};
};
