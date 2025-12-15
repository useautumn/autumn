import type { ExistingRollover, FullCusProduct } from "@shared/index";

export const cusProductToExistingRollovers = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}): ExistingRollover[] => {
	const cusEnts = cusProduct.customer_entitlements;

	const existingRollovers: ExistingRollover[] = [];

	for (const cusEnt of cusEnts) {
		const rollovers = cusEnt.rollovers;
		if (rollovers) {
			existingRollovers.push(
				...rollovers.map((x) => {
					return {
						...x,
						internal_feature_id: cusEnt.entitlement.internal_feature_id,
					};
				}),
			);
		}
	}

	return existingRollovers;
};
