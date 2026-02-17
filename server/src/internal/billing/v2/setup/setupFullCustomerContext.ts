import type { BillingParamsBaseV1 } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { CusService } from "@server/internal/customers/CusService";

export const setupFullCustomerContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: BillingParamsBaseV1;
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
