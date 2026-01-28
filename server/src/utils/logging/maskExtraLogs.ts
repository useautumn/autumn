/** Fields to mask in extra logs (replace with "[MASKED]") */
const MASKED_FIELDS = ["setCache"];

export const maskExtraLogs = (
	extraLogs: Record<string, unknown>,
): Record<string, unknown> => {
	const masked: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(extraLogs)) {
		if (MASKED_FIELDS.includes(key)) {
			masked[key] = "[MASKED]";
		} else if (value && typeof value === "object" && !Array.isArray(value)) {
			masked[key] = maskExtraLogs(value as Record<string, unknown>);
		} else {
			masked[key] = value;
		}
	}
	return masked;
};
