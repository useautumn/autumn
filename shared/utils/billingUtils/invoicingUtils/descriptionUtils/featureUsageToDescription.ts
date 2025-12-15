import type { Feature } from "../../../../models/featureModels/featureModels";
import { getSingularAndPlural, numberWithCommas } from "../../../displayUtils";
import { roundUsageToNearestBillingUnit } from "../lineItemUtils/roundUsageToNearestBillingUnit";

/**
 * Generates base usage description for a feature.
 * Examples: "150 credits", "1 user", "1,500 API calls"
 */
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

	// Ceil usage to nearest billing unit
	const roundedUsage = roundUsageToNearestBillingUnit({
		usage,
		billingUnits,
	});

	const usageStr = numberWithCommas(roundedUsage);

	// 1. If billing units is greater than 1, use plural
	const featureName = usage === 1 ? singular : plural;

	// billingUnits > 1 ? plural :
	return `${usageStr} ${featureName}`;
	// if (billingUnits === 1) {
	// } else {
	// 	return `${usageStr} x ${billingUnits} ${featureName}`;
	// }
};
