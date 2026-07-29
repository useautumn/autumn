import {
	CusProductStatus,
	EntityNotFoundError,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";

const BILLING_CONTEXT_STATUSES = [
	...RELEVANT_STATUSES,
	CusProductStatus.Paused,
];

export const setupFullCustomerContext = async ({
	ctx,
	params,
	withEntities = true,
}: {
	ctx: AutumnContext;
	params: { customer_id: string; entity_id?: string };
	withEntities?: boolean;
}) => {
	const { customer_id: customerId } = params;

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: BILLING_CONTEXT_STATUSES,
		withEntities,
		withSubs: true,
		entityId: params.entity_id ?? undefined,
	});

	if (params.entity_id && !fullCustomer.entity) {
		throw new EntityNotFoundError({ entityId: params.entity_id });
	}

	return fullCustomer;
};
