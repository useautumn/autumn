import {
	type ApiBalanceV1,
	type ApiEntityV1,
	type ApiEntityV2,
	type ApiSubscriptionV1,
	ApiEntityV2Schema,
	type EntityLegacyData,
} from "@autumn/shared";
import { transformBalanceV0ToV1 } from "../../../customers/cusUtils/apiCusUtils/transformBalanceV0ToV1.js";
import { transformSubscriptionV0ToV1 } from "../../../customers/cusUtils/apiCusUtils/transformSubscriptionV0ToV1.js";

/**
 * Transform ApiEntityV1 to ApiEntityV2 format
 * 
 * V2.1 changes:
 * - Merge subscriptions + scheduled_subscriptions into single subscriptions array
 * - Transform subscriptions V0 → V1 (default → auto_enable)
 * - Transform balances V0 → V1 (granted_balance → granted, current_balance → balance, etc.)
 * 
 * This is used in getApiEntity() to build V2 for read endpoints.
 * The version transform system then converts V2 → V1 for V2.0 clients.
 */
export const transformEntityV1ToEntityV2 = ({
	entity,
	legacyData,
}: {
	entity: ApiEntityV1; // V1
	legacyData: EntityLegacyData;
}): ApiEntityV2 => {
	// Merge subscriptions + scheduled_subscriptions into single array and transform V0 → V1
	const allSubscriptionsV0 = [
		...(entity.subscriptions || []),
		...(entity.scheduled_subscriptions || []),
	];
	const allSubscriptionsV1: ApiSubscriptionV1[] = allSubscriptionsV0.map((sub) =>
		transformSubscriptionV0ToV1({ subscription: sub }),
	);

	// Transform balances V0 → V1
	const balancesV1: Record<string, ApiBalanceV1> = {};
	if (entity.balances) {
		for (const [featureId, balanceV0] of Object.entries(entity.balances)) {
			balancesV1[featureId] = transformBalanceV0ToV1({
				balance: balanceV0,
				legacyData: legacyData.cusFeatureLegacyData[featureId],
			});
		}
	}

	const entityV2: ApiEntityV2 = ApiEntityV2Schema.parse({
		// Base fields (unchanged)
		id: entity.id,
		name: entity.name,
		customer_id: entity.customer_id,
		created_at: entity.created_at,
		env: entity.env,

		// V2.1: Single subscriptions array (transformed to V1)
		subscriptions: allSubscriptionsV1.length > 0 ? allSubscriptionsV1 : undefined,

		// V2.1: Balances transformed to V1
		balances: Object.keys(balancesV1).length > 0 ? balancesV1 : undefined,

		// Expand fields (passed through unchanged)
		invoices: entity.invoices,
	});

	return entityV2;
};
