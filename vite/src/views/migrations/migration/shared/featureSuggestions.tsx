import type { Feature } from "@autumn/shared";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import type { ValuePickerOption } from "./ValuePicker";

export function buildFeatureSuggestions(
	features: Feature[],
): ValuePickerOption[] {
	return features.map((f) => ({
		value: f.id,
		label: f.name || f.id,
		icon: getFeatureIcon({ feature: f }),
	}));
}
