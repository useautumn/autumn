import { EntityNotFoundError } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { CusService } from "@server/internal/customers/CusService";

export const setupFullCustomerContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: { customer_id: string; entity_id?: string };
}) => {
	const { customer_id: customerId } = params;

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withSubs: true,
		withEntities: true,
		entityId: params.entity_id ?? undefined,
	});

	if (params.entity_id && !fullCustomer.entity) {
		throw new EntityNotFoundError({ entityId: params.entity_id });
	}

	return fullCustomer;
};
