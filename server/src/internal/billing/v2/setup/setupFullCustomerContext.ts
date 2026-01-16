import type { UpdateSubscriptionV0Params } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { CusService } from "@server/internal/customers/CusService";

export const setupFullCustomerContext = async ({
	ctx,
	params,
	autoCreateCustomer = false,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV0Params;
	autoCreateCustomer?: boolean;
}) => {
	const { db, org, env } = ctx;
	const { customer_id: customerId } = params;

	const fullCustomer = await CusService.getFull({
		db,
		idOrInternalId: customerId,
		orgId: org.id,
		env,
		withSubs: true,
		withEntities: true,
		entityId: params.entity_id ?? undefined,
	});

	return fullCustomer;
};
