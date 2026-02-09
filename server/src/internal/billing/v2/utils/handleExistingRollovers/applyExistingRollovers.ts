import {
	customerEntitlementAllowsRollovers,
	type ExistingRollover,
	type FullCusProduct,
} from "@autumn/shared";
import { generateId } from "@/utils/genUtils";

export const applyExistingRollovers = ({
	customerProduct,
	existingRollovers,
}: {
	customerProduct: FullCusProduct;
	existingRollovers: ExistingRollover[];
}) => {
	const getApplicableRollovers = (): ExistingRollover[] => {
		return existingRollovers.filter(
			(rollover) =>
				rollover.balance > 0 ||
				Object.values(rollover.entities).some((entity) => entity.balance > 0),
		);
	};

	for (const existingRollover of getApplicableRollovers()) {
		const targetCusEnt = customerProduct.customer_entitlements.find(
			(cusEnt) =>
				cusEnt.entitlement.internal_feature_id ===
					existingRollover.internal_feature_id &&
				customerEntitlementAllowsRollovers(cusEnt),
		);

		if (!targetCusEnt) continue;

		if (targetCusEnt) {
			targetCusEnt.rollovers.push({
				...existingRollover,
				id: generateId("roll"),
				cus_ent_id: targetCusEnt.id,
			});
			console.log(
				`Added rollover with balance ${existingRollover.balance} to new cus ent: ${targetCusEnt.id}-${targetCusEnt.entitlement.feature.name}`,
			);
		} else continue;
	}
};
