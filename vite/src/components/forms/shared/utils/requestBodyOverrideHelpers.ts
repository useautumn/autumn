export const requestRecord = (
	value: unknown,
): Record<string, unknown> | undefined =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

export const quantityRecordFrom = (
	value: unknown,
	idKey: string,
): Record<string, number> => {
	if (!Array.isArray(value)) return {};
	return Object.fromEntries(
		value.flatMap((entry) => {
			const id = requestRecord(entry)?.[idKey];
			const quantity = requestRecord(entry)?.quantity;
			return typeof id === "string" && typeof quantity === "number"
				? [[id, quantity]]
				: [];
		}),
	);
};

export const anchorOverridesFrom = (
	value: unknown,
): {
	billingCycleAnchorMode?: "now" | "custom";
	billingCycleAnchorDate?: number;
	resetBillingCycle?: boolean;
} => {
	if (value === "now") {
		return { billingCycleAnchorMode: "now", resetBillingCycle: true };
	}
	if (typeof value === "number") {
		return {
			billingCycleAnchorDate: value,
			billingCycleAnchorMode: "custom",
			resetBillingCycle: true,
		};
	}
	return {};
};
