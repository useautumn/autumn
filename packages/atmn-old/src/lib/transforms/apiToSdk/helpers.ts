export function mapFeatureType(
	apiType: string,
	_consumable: boolean,
): "boolean" | "metered" | "credit_system" {
	if (apiType === "boolean") {
		return "boolean";
	}
	if (apiType === "credit_system") {
		return "credit_system";
	}
	return "metered";
}
