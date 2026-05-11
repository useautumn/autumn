import type { Feature } from "@autumn/shared";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import type { ValuePickerOption } from "./ValuePicker";

export function buildFeatureSuggestions(
	features: Feature[],
): ValuePickerOption[] {
	return features.map((f) => {
		const iconConfig = getFeatureIconConfig(f.type, f.config?.usage_type);
		return {
			value: f.id,
			label: f.name || f.id,
			icon: <span className={iconConfig.color}>{iconConfig.icon}</span>,
		};
	});
}
