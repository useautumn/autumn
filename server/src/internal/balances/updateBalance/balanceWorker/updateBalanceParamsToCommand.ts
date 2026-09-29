import {
	orgToCommandOrg,
	type UpdateBalanceCommand,
} from "@autumn/balance-engine";
import type { UpdateBalanceParamsV0 } from "@autumn/shared";
import type { BalanceWorkerRequestContext } from "../../balanceWorker/balanceWorkerRequestContext.js";
import { featureToInternalFeatureId } from "../../balanceWorker/featureToInternalFeatureId.js";
import { requestContextToCommandBase } from "../../balanceWorker/requestContextToCommandBase.js";
import { buildCustomerEntitlementFilters } from "../../utils/buildCustomerEntitlementFilters.js";

/** The API's fields one to one; the engine owns what each means. Keyed by request, so a redelivered request dedups. */
export const updateBalanceParamsToCommand = ({
	ctx,
	params,
	targetBalance,
}: {
	ctx: BalanceWorkerRequestContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
}): UpdateBalanceCommand => ({
	...requestContextToCommandBase({
		ctx,
		customerId: params.customer_id,
		entityId: params.entity_id ?? null,
	}),
	type: "updateBalance",
	org: orgToCommandOrg({ org: ctx.org }),
	commandId: ctx.id,
	featureId: params.feature_id,
	internalFeatureId: featureToInternalFeatureId({
		ctx,
		featureId: params.feature_id,
	}),
	customerEntitlementFilters: buildCustomerEntitlementFilters({ params }),
	remaining: targetBalance,
	usage: params.usage,
	addToBalance: params.add_to_balance,
	includedGrant: params.included_grant,
	nextResetAt: params.next_reset_at,
	expiresAt: params.expires_at,
});
