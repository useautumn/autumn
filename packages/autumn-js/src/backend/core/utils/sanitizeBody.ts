/** Fields that must come from identity, not frontend */
export const DEFAULT_PROTECTED_BODY_FIELDS = [
	"customerId",
	"customerData",
	"name",
	"email",
	"stripeId",
] as const;

export const CUSTOMER_PROTECTED_BODY_FIELDS = [
	...DEFAULT_PROTECTED_BODY_FIELDS,
	"metadata",
] as const;

export type ProtectedBodyField =
	| (typeof DEFAULT_PROTECTED_BODY_FIELDS)[number]
	| (typeof CUSTOMER_PROTECTED_BODY_FIELDS)[number];

/** Strip protected fields from body to prevent spoofing */
export const sanitizeBody = (
	body: unknown,
	protectedFields: readonly ProtectedBodyField[] = DEFAULT_PROTECTED_BODY_FIELDS,
): Record<string, unknown> => {
	const rawBody = (body as Record<string, unknown>) || {};
	const sanitized: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(rawBody)) {
		if (!protectedFields.includes(key as ProtectedBodyField)) {
			sanitized[key] = value;
		}
	}

	return sanitized;
};
