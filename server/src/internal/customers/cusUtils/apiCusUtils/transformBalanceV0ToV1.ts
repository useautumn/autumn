import {
	type ApiBalanceV0,
	type ApiBalanceV1,
	type ApiBalanceBreakdownV1,
	ApiBalanceV1Schema,
	ApiBalanceBreakdownV1Schema,
	type CusFeatureLegacyData,
} from "@autumn/shared";

/**
 * Transform ApiBalanceV0 (V2.0) to ApiBalanceV1 (V2.1)
 * 
 * V2.1 changes:
 * - Renamed "granted_balance" → "granted"
 * - Renamed "current_balance" → "balance"
 * - Removed "purchased_balance" (stored in legacyData)
 * - Removed "plan_id" (stored in legacyData)
 * - Transform breakdown items V0 → V1
 */
export const transformBalanceV0ToV1 = ({
	balance,
	legacyData,
}: {
	balance: ApiBalanceV0;
	legacyData?: CusFeatureLegacyData;
}): ApiBalanceV1 => {
	const {
		granted_balance,
		current_balance,
		purchased_balance,
		plan_id,
		breakdown,
		...rest
	} = balance;

	// Transform breakdown V0 → V1
	const breakdownV1: ApiBalanceBreakdownV1[] | undefined = breakdown?.map((bd) => {
		const {
			granted_balance: bdGranted,
			current_balance: bdCurrent,
			purchased_balance: bdPurchased,
			overage_allowed,
			max_purchase,
			...bdRest
		} = bd;

		// Get price from legacyData
		const bdLegacyData = legacyData?.breakdown_legacy_data?.find(
			(ld) => ld.id === bd.id,
		);

		return ApiBalanceBreakdownV1Schema.parse({
			...bdRest,
			// V2.1 field names
			included_grant: bdGranted,
			prepaid_grant: bdPurchased,
			remaining: bdCurrent,
			// Price only exists in V1
			price: bdLegacyData?.price ?? null,
		});
	});

	return ApiBalanceV1Schema.parse({
		...rest,
		// V2.1 field names
		granted: granted_balance,
		balance: current_balance,
		breakdown: breakdownV1,
	});
};
