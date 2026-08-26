export type CustomerDisplayInfo = {
	name?: string | null;
	email?: string | null;
};

/** Resolves the label shown for a customer group: name → email → id. */
export function customerDisplayLabel({
	customerId,
	customerNames,
}: {
	customerId: string;
	customerNames?: Record<string, CustomerDisplayInfo>;
}): string {
	const info = customerNames?.[customerId];
	return info?.name || info?.email || customerId;
}
