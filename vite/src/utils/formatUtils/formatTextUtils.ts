import { BillingInterval, EntInterval } from "@autumn/shared";

export const keyToTitle = (
	key: string,
	options?: { exclusionMap?: Record<string, string> },
) => {
	if (options?.exclusionMap?.[key]) {
		return options.exclusionMap[key];
	}
	return key
		.replace(/[_-]/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
};

const keyToTitleFirstCaps = (key: string) => {
	// Capitalize first char
	const res = key.replace(/^\w/, (char) => char.toUpperCase());
	// Replace underscores with spaces
	return res.replace(/_/g, " ");
};

export const slugify = (
	text: string,
	type: "underscore" | "dash" = "underscore",
) => {
	return text
		.toLowerCase()
		.replace(/ /g, type === "underscore" ? "_" : "-")
		.replace(/[^\w\s-]/g, "");
};

export const formatIntervalText = ({
	interval,
	intervalCount,
	billingInterval,
	isBillingInterval = false,
}: {
	interval?: EntInterval;
	billingInterval?: BillingInterval;
	intervalCount?: number;
	isBillingInterval?: boolean;
}) => {
	const finalInterval = interval ?? billingInterval;
	if (finalInterval == null) {
		return "";
	}

	if (finalInterval === BillingInterval.OneOff) {
		return "one off";
	}
	if (finalInterval === EntInterval.Lifetime) {
		return "no reset";
	}
	if (intervalCount && intervalCount > 1) {
		return `per ${intervalCount} ${finalInterval}s`;
	}
	return finalInterval === BillingInterval.SemiAnnual
		? "per half year"
		: `per ${finalInterval}`;
};
