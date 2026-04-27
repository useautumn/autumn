import {
	FeatureNotFoundError,
	type FullCustomer,
	notNullish,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildCustomerEntitlementFilters } from "../utils/buildCustomerEntitlementFilters.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";
import { runRedisUpdateBalanceV2 } from "./runRedisUpdateBalanceV2.js";

/**
 * Updates a balance using the new caching layer (FullCustomer cache).
 *
 * Flow:
 * 1. Get cached full customer (or create if needed)
 * 2. Build featureDeductions with targetBalance
 * 3. Call runRedisUpdateBalanceV2 to update Redis
 * 4. Returns the result (caller handles sync/events if needed)
 */
export const updateRemainingV1 = async ({
	ctx,
	params,
	fullCustomer,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	fullCustomer: FullCustomer;
}) => {
	const { features } = ctx;
	const { feature_id: featureId, add_to_balance: addToBalance } = params;

	const targetBalance = params.remaining ?? params.current_balance;

	// Look up feature
	const feature = features.find((f) => f.id === featureId);
	if (!feature) {
		throw new FeatureNotFoundError({ featureId });
	}

	const customerEntitlementFilters = buildCustomerEntitlementFilters({
		params,
	});

	// 2. Build featureDeductions
	const featureDeductions: FeatureDeduction[] = [
		{
			feature,
			deduction: notNullish(addToBalance) ? -addToBalance : 0,
			targetBalance: notNullish(targetBalance) ? targetBalance : undefined,
		},
	];

	// 3. Call runRedisUpdateBalanceV2
	const result = await runRedisUpdateBalanceV2({
		ctx,
		fullCustomer,
		featureDeductions,
		customerEntitlementFilters,
	});

	return result;
};
