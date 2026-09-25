import {
	type DeleteBalanceCommand,
	orgToCommandOrg,
} from "@autumn/balance-engine";
import type { DeleteBalanceParamsV0 } from "@autumn/shared";
import type { BalanceWorkerRequestContext } from "../../balanceWorker/balanceWorkerRequestContext.js";
import { requestContextToCommandBase } from "../../balanceWorker/requestContextToCommandBase.js";
import { buildCustomerEntitlementFilters } from "../../utils/buildCustomerEntitlementFilters.js";

/** The API's fields one to one; keyed by request, so a retried request dedups. */
export const deleteBalanceParamsToCommand = ({
	ctx,
	params,
}: {
	ctx: BalanceWorkerRequestContext;
	params: DeleteBalanceParamsV0;
}): DeleteBalanceCommand => ({
	...requestContextToCommandBase({
		ctx,
		customerId: params.customer_id,
		entityId: params.entity_id ?? null,
	}),
	type: "deleteBalance",
	org: orgToCommandOrg({ org: ctx.org }),
	commandId: ctx.id,
	featureId: params.feature_id,
	customerEntitlementFilters: buildCustomerEntitlementFilters({ params }),
	recalculate: params.recalculate_balances ?? false,
});
