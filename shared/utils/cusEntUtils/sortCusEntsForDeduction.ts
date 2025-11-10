import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { FeatureType } from "../../models/featureModels/featureEnums.js";
import { AllowanceType } from "../../models/productModels/entModels/entModels.js";
import { entIntervalToValue } from "../intervalUtils.js";
import { isEntityCusEnt } from "./cusEntUtils.js";

export const sortCusEntsForDeduction = (
	cusEnts: FullCusEntWithFullCusProduct[],
	reverseOrder: boolean = false,
	entityId?: string,
) => {
	cusEnts.sort((a, b) => {
		const aEnt = a.entitlement;
		const bEnt = b.entitlement;

		// 0. Sort customer-level vs entity-level based on tracking context
		// If entityId is provided: entity-level goes first (deduct entity's own resources first)
		// If entityId is null: customer-level goes first (deduct customer resources first)
		const aIsEntity = isEntityCusEnt({ cusEnt: a });
		const bIsEntity = isEntityCusEnt({ cusEnt: b });

		if (aIsEntity !== bIsEntity) {
			if (entityId) {
				// Entity-level tracking: entity entitlements go first
				return aIsEntity ? -1 : 1;
			} else {
				// Customer-level tracking: customer entitlements go first
				return aIsEntity ? 1 : -1;
			}
		}

		// 1. If boolean, go first
		if (aEnt.feature.type === FeatureType.Boolean) {
			return -1;
		}

		if (bEnt.feature.type === FeatureType.Boolean) {
			return 1;
		}

		// 1. If a is credit system and b is not, a should go last
		if (
			aEnt.feature.type === FeatureType.CreditSystem &&
			bEnt.feature.type !== FeatureType.CreditSystem
		) {
			return 1;
		}

		// 2. If a is not credit system and b is, a should go first
		if (
			aEnt.feature.type !== FeatureType.CreditSystem &&
			bEnt.feature.type === FeatureType.CreditSystem
		) {
			return -1;
		}

		// 2. Sort by unlimited (unlimited goes first)
		if (
			aEnt.allowance_type === AllowanceType.Unlimited &&
			bEnt.allowance_type !== AllowanceType.Unlimited
		) {
			return -1;
		}

		if (
			aEnt.allowance_type !== AllowanceType.Unlimited &&
			bEnt.allowance_type === AllowanceType.Unlimited
		) {
			return 1;
		}

		// // If one has usage_allowed, it should go last
		// if (!a.usage_allowed && b.usage_allowed) {
		// 	return -1;
		// }

		// if (!b.usage_allowed && a.usage_allowed) {
		// 	return 1;
		// }

		// If one has a next_reset_at, it should go first
		const nextResetFirst = reverseOrder ? 1 : -1;

		if (a.next_reset_at && !b.next_reset_at) {
			return nextResetFirst;
		}

		// If b has a next_reset_at, it should go first
		if (!a.next_reset_at && b.next_reset_at) {
			return -nextResetFirst;
		}

		// 3. Sort by interval
		const aVal = entIntervalToValue(aEnt.interval, aEnt.interval_count);
		const bVal = entIntervalToValue(bEnt.interval, bEnt.interval_count);
		if (aEnt.interval && bEnt.interval && !aVal.eq(bVal)) {
			if (reverseOrder) {
				return bVal.sub(aVal).toNumber();
				// return intervalOrder[bEnt.interval] - intervalOrder[aEnt.interval];
			} else {
				return aVal.sub(bVal).toNumber();
				// return intervalOrder[aEnt.interval] - intervalOrder[bEnt.interval];
			}
		}

		// 0a. If both are entity products (attached to entities), sort by entity_id for consistent ordering
		const aIsProductEntity = !!a.customer_product?.internal_entity_id;
		const bIsProductEntity = !!b.customer_product?.internal_entity_id;

		if (aIsProductEntity && bIsProductEntity) {
			const aEntityId = a.customer_product?.entity_id;
			const bEntityId = b.customer_product?.entity_id;

			if (aEntityId && bEntityId && aEntityId !== bEntityId) {
				return aEntityId.localeCompare(bEntityId);
			}
		}

		// Check if a is main product
		const aIsAddOn = a.customer_product?.product?.is_add_on;
		const bIsAddOn = b.customer_product?.product?.is_add_on;

		if (aIsAddOn && !bIsAddOn) {
			return 1;
		}

		if (!aIsAddOn && bIsAddOn) {
			return -1;
		}

		// 4. Sort by created_at
		return a.created_at - b.created_at;
	});

	// console.log(
	//   `Cus ents after (${reverseOrder ? "reversed" : "normal"})`,
	//   cusEnts.map(
	//     (ce) => `${ce.entitlement.feature_id} - ${ce.entitlement.interval}`
	//   )
	// );
};
