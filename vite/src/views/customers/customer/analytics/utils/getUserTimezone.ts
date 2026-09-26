/** The viewer's IANA timezone (e.g. "America/New_York"), or UTC when unknown. */
export const getUserTimezone = (): string => {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return "UTC";
	}
};
