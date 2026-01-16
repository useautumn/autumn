import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { FeatureUsageType } from "../../../models/featureModels/featureEnums";
import { nullish } from "../../utils";
import { cusEntToCusPrice } from "../convertCusEntUtils/cusEntToCusPrice";

export const cusEntToUsageAllowed = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	return (
		cusEnt.usage_allowed ||
		(cusEnt.entitlement.feature.config?.usage_type ===
			FeatureUsageType.Continuous &&
			nullish(cusPrice))
	);
};
