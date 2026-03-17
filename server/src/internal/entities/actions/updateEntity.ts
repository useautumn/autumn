import {
	CustomerExpand,
	CustomerNotFoundError,
	EntityNotFoundError,
	type UpdateEntityParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { updateEntityDbAndCache } from "./updateEntityDbAndCache.js";

export const updateEntity = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateEntityParams;
}) => {
	const {
		customer_id: customerId,
		entity_id: entityId,
		billing_controls,
	} = params;
	if (!customerId) {
		throw new CustomerNotFoundError({ customerId: "" });
	}

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		// withEntities: true,
		entityId: entityId,
		expand: [CustomerExpand.Invoices],
	});

	const entity = fullCustomer.entity;

	if (!entity) {
		throw new EntityNotFoundError({ entityId });
	}

	await updateEntityDbAndCache({
		ctx,
		customerId,
		entity,
		updates: {
			spend_limits: billing_controls?.spend_limits,
		},
	});

	return entity.id ?? entity.internal_id;
};
