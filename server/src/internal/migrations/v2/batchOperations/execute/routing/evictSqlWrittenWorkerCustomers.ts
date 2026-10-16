import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { queueBalanceWorkerEvicts } from "@/internal/balances/balanceWorker/queueBalanceWorkerEvicts.js";
import type { RoutedPageCustomer } from "./types/routedPageCustomer.js";

export const evictSqlWrittenWorkerCustomers = async ({
	ctx,
	workerCustomers,
	sqlWrittenInternalCustomerIds,
}: {
	ctx: Pick<AutumnContext, "org" | "env">;
	workerCustomers: RoutedPageCustomer[];
	sqlWrittenInternalCustomerIds: string[];
}): Promise<void> => {
	if (sqlWrittenInternalCustomerIds.length === 0) return;
	const sqlWrittenIds = new Set(sqlWrittenInternalCustomerIds);
	await queueBalanceWorkerEvicts({
		customers: workerCustomers
			.filter(({ internalId }) => sqlWrittenIds.has(internalId))
			.map(({ id }) => ({ orgId: ctx.org.id, env: ctx.env, customerId: id })),
	});
};
