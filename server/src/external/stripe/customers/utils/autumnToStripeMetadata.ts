const STRIPE_MAX_KEYS = 48;
export const STRIPE_MAX_KEY_LENGTH = 40;
const STRIPE_MAX_VALUE_LENGTH = 500;

export const autumnToStripeCustomerMetadata = ({
	metadata,
}: {
	metadata: Record<string, unknown> | null | undefined;
}): Record<string, string> => {
	if (!metadata) return {};

	const result: Record<string, string> = {};
	let count = 0;

	for (const [key, value] of Object.entries(metadata)) {
		if (count >= STRIPE_MAX_KEYS) break;
		if (key.startsWith("autumn_")) continue;
		if (value === undefined || value === null) continue;

		const stripeKey = key.slice(0, STRIPE_MAX_KEY_LENGTH);

		const stripeValue =
			typeof value === "object" ? JSON.stringify(value) : String(value);

		result[stripeKey] = stripeValue.slice(0, STRIPE_MAX_VALUE_LENGTH);
		count++;
	}

	return result;
};
