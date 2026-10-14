import type { Feature } from "../../../../models/featureModels/featureModels";
import { getSingularAndPlural, numberWithCommas } from "../../../displayUtils";
import { roundUsageToNearestBillingUnit } from "../../usageUtils/roundUsageToNearestBillingUnit";

export const featureUsageToDescription = ({
	feature,
	usage,
	billingUnits,
}: {
	feature: Feature;
	usage: number;
	billingUnits: number;
}): string => {
	const { singular, plural } = getSingularAndPlural({ feature });

	const roundedUsage = roundUsageToNearestBillingUnit({
		usage,
		billingUnits,
	});

	const usageStr = numberWithCommas(roundedUsage);

	const featureName = usage === 1 ? singular : plural;

	return `${usageStr} ${featureName}`;
};
