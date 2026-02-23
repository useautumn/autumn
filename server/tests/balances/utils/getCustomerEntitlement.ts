import { fullCustomerToCustomerEntitlements } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { CusService } from "@/internal/customers/CusService.js";

export const findCustomerEntitlement = async ({
	ctx,
	customerId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	featureId?: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	return cusEnts;
};
