import { format } from "date-fns/format";

export const formatMs = (
	unixDate?: number | null,
	options?: { withTimezone?: boolean },
) => {
	if (!unixDate) {
		return "undefined unix date";
	}
	return format(
		new Date(unixDate),
		options?.withTimezone ? "dd MMM yyyy HH:mm:ss z" : "dd MMM yyyy HH:mm:ss",
	);
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
