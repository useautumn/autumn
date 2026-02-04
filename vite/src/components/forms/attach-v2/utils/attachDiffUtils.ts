import type { CheckoutChange, ProductItem } from "@autumn/shared";

/**
 * Converts outgoing checkout changes to ProductItem format for diff comparison.
 * Aggregates balances by feature_id (sums if same feature appears in multiple outgoing products).
 */
export function outgoingToProductItems(
	outgoing: CheckoutChange[] | undefined,
): ProductItem[] {
	if (!outgoing || outgoing.length === 0) return [];

	// Aggregate balances by feature_id
	const featureBalances = new Map<
		string,
		{ balance: number; unlimited: boolean }
	>();

	for (const change of outgoing) {
		for (const [featureId, apiBalance] of Object.entries(change.balances)) {
			const existing = featureBalances.get(featureId);

			if (existing) {
				// Sum balances from multiple outgoing products
				existing.balance += apiBalance.granted_balance;
				if (apiBalance.unlimited) {
					existing.unlimited = true;
				}
			} else {
				featureBalances.set(featureId, {
					balance: apiBalance.granted_balance,
					unlimited: apiBalance.unlimited,
				});
			}
		}
	}

	// Convert to ProductItem format
	return Array.from(featureBalances.entries()).map(
		([featureId, data]): ProductItem => ({
			feature_id: featureId,
			included_usage: data.unlimited ? "inf" : data.balance,
		}),
	);
}
