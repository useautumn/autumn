import {
	cusEntMatchesFeature,
	cusEntToStartingBalance,
	type FullCusEntWithFullCusProduct,
	filterPerEntityCustomerEntitlementsByFeature,
	type UpdateCustomerEntitlement,
} from "@autumn/shared";
import type { EntitiesByFeature } from "../types/entitiesByFeature.js";

/** Inserted entities use the feature's balance (−N); inserted and claimed ones are granted its per-entity balances. */
export const computeEntityBalancesPlan = ({
	customerEntitlements,
	entitiesByFeature,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	entitiesByFeature: EntitiesByFeature;
}): UpdateCustomerEntitlement[] => {
	const { feature, inserted, claimed } = entitiesByFeature;
	const entityIds = [...inserted, ...claimed].flatMap((entity) =>
		entity.id === null ? [] : [entity.id],
	);

	const featureUpdates = customerEntitlements
		.filter((cusEnt) => cusEntMatchesFeature({ cusEnt, feature }))
		.map((customerEntitlement) => ({
			customerEntitlement,
			balanceChange: -inserted.length,
		}));

	const perEntityUpdates = filterPerEntityCustomerEntitlementsByFeature({
		customerEntitlements,
		feature,
	}).map((customerEntitlement) => {
		const startingBalance = cusEntToStartingBalance({
			cusEnt: customerEntitlement,
		});
		return {
			customerEntitlement,
			entityBalanceChanges: Object.fromEntries(
				entityIds.map((entityId) => [entityId, startingBalance]),
			),
		};
	});

	return [...featureUpdates, ...perEntityUpdates];
};
