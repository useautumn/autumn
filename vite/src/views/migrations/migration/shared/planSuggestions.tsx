import type { FrontendProduct } from "@autumn/shared";
import { PackageIcon } from "@phosphor-icons/react";
import type { ValuePickerOption } from "./ValuePicker";

export function buildPlanSuggestions(
	products: FrontendProduct[],
): ValuePickerOption[] {
	const seen = new Set<string>();
	return products
		.filter((p) => {
			if (!p.id || seen.has(p.id)) return false;
			seen.add(p.id);
			return true;
		})
		.map((p) => ({
			value: p.id,
			label: p.name || p.id,
			sublabel: p.name ? p.id : undefined,
			icon: (
				<PackageIcon
					size={14}
					weight="duotone"
					className="text-tertiary-foreground"
				/>
			),
		}));
}
