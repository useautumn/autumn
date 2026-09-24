import {
	ATTACH_CONFLICT_STATUSES,
	CusProductStatus,
	EntityNotFoundError,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { flushBalanceWorkerCustomer } from "@/internal/balances/balanceWorker/flushBalanceWorkerCustomer";
import { CusService } from "@/internal/customers/CusService";

const BILLING_CONTEXT_STATUSES = [
	...ATTACH_CONFLICT_STATUSES,
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

	// The plan is computed from Postgres; a track the worker just accepted must be there first.
	await flushBalanceWorkerCustomer({ ctx, customerId });

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
