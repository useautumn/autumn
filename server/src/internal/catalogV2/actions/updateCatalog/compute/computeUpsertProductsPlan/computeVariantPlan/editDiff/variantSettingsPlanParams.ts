import {
	BILLING_CONTROL_KEYS,
	billingControlsFromColumns,
	type Product,
	productDetailFieldIsSame,
	productProcessorsAreSame,
	productToPlanProcessors,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";

type VariantSettingsPlanParams = Pick<
	UpdateCatalogPlanParams,
	| "description"
	| "group"
	| "add_on"
	| "config"
	| "metadata"
	| "billing_controls"
	| "processors"
>;

const settingsChanged = ({
	key,
	current,
	next,
}: {
	key: "description" | "group" | "is_add_on" | "config" | "metadata";
	current: Product;
	next: Product;
}): boolean =>
	!productDetailFieldIsSame({ key, product1: current, product2: next });

/** Base current→next settings. Name / default / archive never copy. */
export const variantSettingsPlanParams = ({
	current,
	next,
}: {
	current: Product | null;
	next: Product;
}): VariantSettingsPlanParams => {
	if (!current) return {};

	const patch: VariantSettingsPlanParams = {};
	if (settingsChanged({ key: "description", current, next })) {
		patch.description = next.description;
	}
	if (settingsChanged({ key: "group", current, next })) {
		patch.group = next.group;
	}
	if (settingsChanged({ key: "is_add_on", current, next })) {
		patch.add_on = next.is_add_on;
	}
	if (settingsChanged({ key: "config", current, next })) {
		patch.config = next.config;
	}
	if (settingsChanged({ key: "metadata", current, next })) {
		patch.metadata = next.metadata ?? {};
	}
	if (
		BILLING_CONTROL_KEYS.some(
			(key) =>
				!productDetailFieldIsSame({ key, product1: current, product2: next }),
		)
	) {
		patch.billing_controls = billingControlsFromColumns(next);
	}

	if (
		!productProcessorsAreSame({
			left: current.processor,
			right: next.processor,
		})
	) {
		const nextProcessors = productToPlanProcessors({ product: next });
		if (nextProcessors) patch.processors = nextProcessors;
	}

	return patch;
};
