import {
	type ApiBalanceV1,
	type ApiCustomer,
	type ApiCustomerV5,
	type ApiSubscriptionV1,
	ApiCustomerV5Schema,
	type CustomerLegacyData,
} from "@autumn/shared";
import { transformBalanceV0ToV1 } from "./transformBalanceV0ToV1.js";
import { transformSubscriptionV0ToV1 } from "./transformSubscriptionV0ToV1.js";

/**
 * Transform ApiCustomerV4 to ApiCustomerV5 format
 * 
 * V2.1 changes:
 * - Merge subscriptions + scheduled_subscriptions into single subscriptions array
 * - Transform subscriptions V0 → V1 (default → auto_enable)
 * - Transform balances V0 → V1 (granted_balance → granted, current_balance → balance, etc.)
 * 
 * This is used in getApiCustomer() to build V5 for read endpoints.
 * The version transform system then converts V5 → V4 for V2.0 clients.
 */
export const transformCustomerV4ToCustomerV5 = ({
	customer,
	legacyData,
}: {
	customer: ApiCustomer; // V4
	legacyData: CustomerLegacyData;
}): ApiCustomerV5 => {
	// Merge subscriptions + scheduled_subscriptions into single array and transform V0 → V1
	const allSubscriptionsV0 = [
		...(customer.subscriptions || []),
		...(customer.scheduled_subscriptions || []),
	];
	const allSubscriptionsV1: ApiSubscriptionV1[] = allSubscriptionsV0.map((sub) =>
		transformSubscriptionV0ToV1({ subscription: sub }),
	);

	// Transform balances V0 → V1
	const balancesV1: Record<string, ApiBalanceV1> = {};
	for (const [featureId, balanceV0] of Object.entries(customer.balances)) {
		balancesV1[featureId] = transformBalanceV0ToV1({
			balance: balanceV0,
			legacyData: legacyData.cusFeatureLegacyData[featureId],
		});
	}

	const customerV5: ApiCustomerV5 = ApiCustomerV5Schema.parse({
		// Base fields (unchanged)
		autumn_id: customer.autumn_id,
		id: customer.id,
		name: customer.name,
		email: customer.email,
		created_at: customer.created_at,
		fingerprint: customer.fingerprint,
		stripe_id: customer.stripe_id,
		env: customer.env,
		metadata: customer.metadata,

		// V2.1: Single subscriptions array (transformed to V1)
		subscriptions: allSubscriptionsV1,

		// V2.1: Balances transformed to V1
		balances: balancesV1,

		// Expand fields (passed through unchanged)
		invoices: customer.invoices,
		entities: customer.entities,
		trials_used: customer.trials_used,
		rewards: customer.rewards,
		referrals: customer.referrals,
		payment_method: customer.payment_method,
	});

	return customerV5;
};
