import { format } from "date-fns/format";

export const formatMsToDate = (
	unixDate?: number | null,
	options?: { withTimezone?: boolean },
) => {
	if (!unixDate) {
		return "undefined";
	}
	return format(new Date(unixDate), "dd MMM yyyy");
};

export const formatMs = (
	unixDate?: number | null | "now",
	options?: { withTimezone?: boolean; excludeSeconds?: boolean },
) => {
	if (unixDate === "now") {
		return "now";
	}
	if (!unixDate) {
		return "undefined";
	}

	let formatString = options?.excludeSeconds
		? "dd MMM yyyy HH:mm"
		: "dd MMM yyyy HH:mm:ss";

	if (options?.withTimezone) {
		formatString = `${formatString} z`;
	}

	return format(new Date(unixDate), formatString);
};

/**
 * Formats a unix timestamp in SECONDS to a date and time string.
 * If unixSeconds is falsy, returns "undefined unix date".
 */
export const formatSeconds = (
	unixSeconds?: number | null,
	options?: { withTimezone?: boolean },
): string => {
	if (!unixSeconds && unixSeconds !== 0) {
		return "undefined unix date";
	}
	return format(
		new Date(unixSeconds * 1000),
		options?.withTimezone ? "dd MMM yyyy HH:mm:ss z" : "dd MMM yyyy HH:mm:ss",
	);
};
