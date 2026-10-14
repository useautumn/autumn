import type { Entitlement, Price, ProductV2 } from "@autumn/shared";

export const productV2ToV1 = ({
	productV2,
	entitlements,
	prices,
}: {
	productV2: ProductV2;
	entitlements: Entitlement[];
	prices: Price[];
}) => {
	const entitlementsRecord: Record<string, Entitlement> = {};
	for (const ent of entitlements) {
		if (ent.feature_id) {
			entitlementsRecord[ent.feature_id] = ent;
		}
	}

	return {
		id: productV2.id,
		name: productV2.name,
		is_default: productV2.is_default,
		is_add_on: productV2.is_add_on,
		entitlements: entitlementsRecord,
		prices,
		free_trial: productV2.free_trial,
		group: productV2.group,
	};
};
