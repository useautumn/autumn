import type {
	EntityBalance,
	FullCustomerEntitlement,
} from "../../models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { FeatureType } from "../../models/featureModels/featureEnums";
import { AllowanceType } from "../../models/productModels/entModels/entModels";
import { cusEntToCusPrice } from "../productUtils/convertUtils";
import { isAllocatedPrice } from "../productUtils/priceUtils/classifyPriceUtils";
import { notNullish } from "../utils";

export const isUnlimitedCusEnt = (cusEnt: FullCustomerEntitlement) => {
	return cusEnt.entitlement.allowance_type === AllowanceType.Unlimited;
};

/**
 * Type guard that narrows cusEnt to have non-null entities.
 * Use directly with cusEnt (not wrapped in object) for type narrowing to work.
 */
export const isEntityScopedCusEnt = <T extends FullCustomerEntitlement>(
	cusEnt: T,
): cusEnt is T & { entities: Record<string, EntityBalance> } => {
	return notNullish(cusEnt.entitlement.entity_feature_id);
};

export const cusEntsHavePrice = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	return cusEnts.some((cusEnt) => {
		const cusPrice = cusEntToCusPrice({ cusEnt });
		return notNullish(cusPrice);
	});
};

export const isBooleanCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	return cusEnt.entitlement.feature.type === FeatureType.Boolean;
};

export const isAllocatedCusEnt = (cusEnt: FullCusEntWithFullCusProduct) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });

	return cusPrice && isAllocatedPrice(cusPrice.price);
};
