import { EntityNotFoundError } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer";

export const setupFullCustomerContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: { customer_id: string; entity_id?: string };
}) => {
	const { customer_id: customerId } = params;

	const fullCustomer = await getOrSetCachedFullCustomer({
		ctx,
		customerId,
		entityId: params.entity_id ?? undefined,
		source: "setupFullCustomerContext",
	});

	if (params.entity_id && !fullCustomer.entity) {
		throw new EntityNotFoundError({ entityId: params.entity_id });
	}

	return fullCustomer;
};
