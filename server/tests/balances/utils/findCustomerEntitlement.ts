import {
	type FullCustomer,
	type FullCustomerEntitlement,
	fullCustomerToCustomerEntitlements,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { CusService } from "@/internal/customers/CusService.js";

export const findCustomerEntitlement = async ({
	ctx,
	customerId,
	fullCustomer,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	fullCustomer?: FullCustomer;
	featureId?: string;
}): Promise<FullCustomerEntitlement | undefined> => {
	fullCustomer =
		fullCustomer ||
		(await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		}));

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	return cusEnts?.[0];
};
