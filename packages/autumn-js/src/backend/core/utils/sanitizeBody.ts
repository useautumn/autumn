/** Fields that must come from identity, not frontend */
const PROTECTED_FIELDS = [
	"customerId",
	"name",
	"email",
	"metadata",
	"stripeId",
];

/** Strip protected fields from body to prevent spoofing */
export const sanitizeBody = (body: unknown): Record<string, unknown> => {
	const rawBody = (body as Record<string, unknown>) || {};
	const sanitized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(rawBody)) {
		if (!PROTECTED_FIELDS.includes(key)) {
			sanitized[key] = value;
		}
	}

	return sanitized;
};
