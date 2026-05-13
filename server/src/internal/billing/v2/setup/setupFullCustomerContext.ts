import { EntityNotFoundError } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

export const setupFullCustomerContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: { customer_id: string; entity_id?: string };
}) => {
	const { customer_id: customerId } = params;

	// const fullCustomer = await getOrSetCachedFullCustomer({
	// 	ctx,
	// 	customerId,
	// 	entityId: params.entity_id ?? undefined,
	// 	source: "setupFullCustomerContext",
	// });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
		withSubs: true,
		entityId: params.entity_id ?? undefined,
	});

	if (params.entity_id && !fullCustomer.entity) {
		throw new EntityNotFoundError({ entityId: params.entity_id });
	}

	return fullCustomer;
};
