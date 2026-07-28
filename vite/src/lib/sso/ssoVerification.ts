import { format } from "date-fns";

const parse = (expiresAt: string) => {
	const time = Date.parse(expiresAt);
	return Number.isNaN(time) ? null : new Date(time);
};

export const isVerificationExpired = (expiresAt: string, now = new Date()) => {
	const date = parse(expiresAt);
	if (!date) return false;
	return date.getTime() <= now.getTime();
};

/** `null` when the timestamp can't be parsed, so the UI just omits the line. */
export const formatVerificationExpiry = (expiresAt: string) => {
	const date = parse(expiresAt);
	if (!date) return null;
	return format(date, "d MMM yyyy, HH:mm");
};
