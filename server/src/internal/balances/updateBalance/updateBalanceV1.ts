import { notNullish, type UpdateBalanceParamsV0 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import { buildCustomerEntitlementFilters } from "../utils/buildCustomerEntitlementFilters.js";
import { runUpdateUsage } from "./runUpdateUsage.js";
import { updateGrantedBalance } from "./updateGrantedBalance.js";
import { updateNextResetAt } from "./updateNextResetAt.js";
import { updateRemainingV1 } from "./updateRemainingV1.js";

export const updateBalanceV1 = async ({
	ctx,
	params,
	targetBalance,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
}) => {
	let fullCustomer = await getOrSetCachedFullCustomer({
		ctx,
		customerId: params.customer_id,
		entityId: params.entity_id,
		source: "handleUpdateBalance",
	});

	if (notNullish(params.add_to_balance) || notNullish(targetBalance)) {
		const result = await updateRemainingV1({ ctx, params, fullCustomer });
		fullCustomer = result?.fullCus ?? fullCustomer;
	}

	if (notNullish(params.usage)) {
		const result = await runUpdateUsage({ ctx, params, fullCustomer });
		fullCustomer = result?.fullCus ?? fullCustomer;
	}

	if (notNullish(params.included_grant)) {
		ctx.logger.info(
			`updating granted balance for feature ${params.feature_id} to ${params.included_grant}`,
		);

		const customerEntitlementFilters = buildCustomerEntitlementFilters({
			params,
		});

		await updateGrantedBalance({
			ctx,
			fullCustomer,
			featureId: params.feature_id,
			targetGrantedBalance: params.included_grant,
			customerEntitlementFilters,
		});
	}

	if (notNullish(params.next_reset_at)) {
		const customerEntitlementFilters = buildCustomerEntitlementFilters({
			params,
		});

		await updateNextResetAt({
			ctx,
			fullCustomer,
			featureId: params.feature_id,
			nextResetAt: params.next_reset_at,
			customerEntitlementFilters,
		});
	}
};
