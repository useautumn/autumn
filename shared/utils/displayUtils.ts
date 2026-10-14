import { format } from "date-fns";
import type { Feature } from "../models/featureModels/featureModels.js";
export const getFeatureName = ({
	feature,
	plural,
	units,
	capitalize = false,
}: {
	feature?: Feature;
	plural?: boolean;
	units?: any;
	capitalize?: boolean;
}) => {
	if (!feature) {
		return "";
	}

	let featureName = feature.name || "";

	if (feature.display) {
		let finalPlural: boolean | undefined;

		if (plural !== undefined) {
			finalPlural = plural;
		} else {
			finalPlural = units !== 1;
		}

		if (finalPlural) {
			featureName = feature.display.plural || featureName;
		} else {
			featureName = feature.display.singular || featureName;
		}
	}

	if (capitalize) {
		featureName = featureName
			.split(" ")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}

	return featureName;
};

export const getFeatureNameWithCapital = ({
	feature,
}: {
	feature: Feature;
}) => {
	if (feature.name && feature.name.length > 0) {
		return `${feature.name.charAt(0).toUpperCase()}${feature.name.slice(1)}`;
	}

	return feature.name;
};

export const getSingularAndPlural = ({
	feature,
	capitalize = false,
}: {
	feature: Feature;
	capitalize?: boolean;
}) => {
	return {
		singular: getFeatureName({ feature, plural: false, capitalize }),
		plural: getFeatureName({ feature, plural: true, capitalize }),
	};
};

export const numberWithCommas = (x: number) => {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 20 }).format(
		x,
	);
};

export const usageToFeatureName = ({
	usage,
	feature,
}: {
	usage: number;
	feature: Feature;
}) => {
	const { singular, plural } = getSingularAndPlural({ feature });

	if (usage === 1) {
		return singular;
	}

	return plural;
};

export const getFeatureInvoiceDescription = ({
	feature,
	usage,
	billingUnits = 1,
	prodName,
	isPrepaid = false,
	fromUnix,
}: {
	feature: Feature;
	usage: number;
	billingUnits?: number | null;
	prodName?: string;
	isPrepaid?: boolean;
	fromUnix?: number;
}) => {
	const { singular, plural } = getSingularAndPlural({ feature });

	const usageStr = numberWithCommas(Math.ceil(usage));

	let result = "";

	if (isPrepaid && billingUnits && billingUnits > 1) {
		result = `${usageStr} x ${billingUnits} ${plural}`;
	} else {
		if (usage === 1) {
			result = `${usageStr} ${singular}`;
		} else {
			result = `${usageStr} ${plural}`;
		}
	}

	if (prodName) {
		result = `${prodName} - ${result}`;
	}

	if (fromUnix) {
		result = `${result} (from ${format(fromUnix, "d MMM yyyy")})`;
	}

	return result;
};
