import type { Feature } from "../../../../models/featureModels/featureModels";
import { getSingularAndPlural, numberWithCommas } from "../../../displayUtils";

/**
 * Generates base usage description for a feature.
 * Examples: "150 credits", "1 user", "1,500 API calls"
 */
export const featureUsageToDescription = ({
	feature,
	usage,
}: {
	feature: Feature;
	usage: number;
}): string => {
	const { singular, plural } = getSingularAndPlural({ feature });
	const usageStr = numberWithCommas(Math.ceil(usage));
	const featureName = usage === 1 ? singular : plural;

	return `${usageStr} ${featureName}`;
};
