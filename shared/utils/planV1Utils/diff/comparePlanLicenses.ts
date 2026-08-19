import type { ApiPlanLicenseV1 } from "@api/products/apiPlanLicenseV1.js";
import type {
	CustomizePlanLicense,
	LicenseCustomize,
	RemovePlanLicense,
} from "@models/licenseModels/licenseModels.js";
import {
	arraysEqual,
	itemsEqual,
	planItemFiltersEqual,
	pricesEqual,
} from "./comparePlanItems.js";

/** Overlay has a real patch — price / items present. `{}` is empty. */
export const hasLicenseCustomize = (
	customize?: LicenseCustomize | null,
): boolean =>
	customize != null &&
	(customize.price !== undefined ||
		customize.add_items !== undefined ||
		customize.remove_items !== undefined);

/** Overlay *content*. `undefined` / `null` / `{}` are the same empty overlay.
 * `{ price: null }` is not empty — it clears the license plan's base price. */
export const licenseCustomizesAreSame = ({
	left,
	right,
}: {
	left?: LicenseCustomize | null;
	right?: LicenseCustomize | null;
}): boolean => {
	const a = left ?? {};
	const b = right ?? {};

	const diffs = {
		price: !pricesEqual(a.price, b.price),
		addItems: !arraysEqual({
			left: a.add_items,
			right: b.add_items,
			equals: itemsEqual,
		}),
		removeItems: !arraysEqual({
			left: a.remove_items,
			right: b.remove_items,
			equals: planItemFiltersEqual,
		}),
	};

	return !Object.values(diffs).some(Boolean);
};

/** Patch customize: `null` is "clear". Omitted / `{}` are "no overlay payload". */
export const licenseCustomizePatchesAreSame = ({
	left,
	right,
}: {
	left?: LicenseCustomize | null;
	right?: LicenseCustomize | null;
}): boolean => {
	if (left === null && right === null) return true;
	if (left === null || right === null) return false;
	return licenseCustomizesAreSame({ left, right });
};

/** Omitted / `null` / `{}` are empty. Remaining keys compared shallowly. */
const metadatasAreSame = (
	left?: Record<string, unknown> | null,
	right?: Record<string, unknown> | null,
): boolean => {
	const a = left ?? {};
	const b = right ?? {};
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const key of keys) {
		if (a[key] !== b[key]) return false;
	}
	return true;
};

/** Link snapshot (`ApiPlanLicenseV1`). `version` and expanded `plan` are display. */
export const planLicensesAreSame = ({
	left,
	right,
}: {
	left: ApiPlanLicenseV1;
	right: ApiPlanLicenseV1;
}): boolean => {
	const diffs = {
		licensePlanId: left.license_plan_id !== right.license_plan_id,
		included: left.included !== right.included,
		prepaidOnly: left.prepaid_only !== right.prepaid_only,
		customize: !licenseCustomizesAreSame({
			left: left.customize,
			right: right.customize,
		}),
	};

	return !Object.values(diffs).some(Boolean);
};

/** Upsert patch. Omitted `included` / `prepaid_only` is not 0 / false. */
export const customizePlanLicensesAreSame = ({
	left,
	right,
}: {
	left: CustomizePlanLicense;
	right: CustomizePlanLicense;
}): boolean => {
	const diffs = {
		licensePlanId: left.license_plan_id !== right.license_plan_id,
		included: left.included !== right.included,
		prepaidOnly: left.prepaid_only !== right.prepaid_only,
		customize: !licenseCustomizePatchesAreSame({
			left: left.customize,
			right: right.customize,
		}),
		metadata: !metadatasAreSame(left.metadata, right.metadata),
	};

	return !Object.values(diffs).some(Boolean);
};

export const removePlanLicensesAreSame = ({
	left,
	right,
}: {
	left: RemovePlanLicense;
	right: RemovePlanLicense;
}): boolean => left.license_plan_id === right.license_plan_id;
