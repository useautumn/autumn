import {
	type FullCustomer,
	type FullCustomerEntitlement,
	fullCustomerToCustomerEntitlements,
} from "@autumn/shared";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer.js";
import { CusService } from "@/internal/customers/CusService.js";

/** Postgres trails the worker by its unflushed writes, so a read of the rows lands them first. */
const readFullCustomerFromPostgres = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): Promise<FullCustomer> => {
	if (isBalanceWorkerRoute())
		await flushBalanceWorkerCustomer({ ctx, customerId });
	return CusService.getFull({ ctx, idOrInternalId: customerId });
};

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
		fullCustomer || (await readFullCustomerFromPostgres({ ctx, customerId }));

	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	return cusEnts?.[0];
};
