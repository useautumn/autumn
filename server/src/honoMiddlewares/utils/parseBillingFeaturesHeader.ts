/** `x-billing-features: atoms=true,foo=false` → `{ atoms: true, foo: false }`; absent → undefined. */
export const parseBillingFeaturesHeader = (
	header: string | undefined,
): Partial<Record<string, boolean>> | undefined => {
	if (!header) return undefined;
	return Object.fromEntries(
		header
			.split(",")
			.map((pair) => pair.trim().split("="))
			.filter(([featureId]) => featureId)
			.map(([featureId, value]) => [featureId, value === "true"]),
	);
};
