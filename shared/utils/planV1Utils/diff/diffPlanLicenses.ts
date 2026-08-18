import type { ApiPlanLicenseV1 } from "@api/products/apiPlanLicenseV1.js";
import type {
	CustomizePlanLicense,
	RemovePlanLicense,
} from "@models/licenseModels/licenseModels.js";
import {
	hasLicenseCustomize,
	planLicensesAreSame,
} from "./comparePlanLicenses.js";

const toUpsertLicense = ({
	license,
	clearCustomize = false,
}: {
	license: ApiPlanLicenseV1;
	clearCustomize?: boolean;
}): CustomizePlanLicense => ({
	license_plan_id: license.license_plan_id,
	included: license.included,
	prepaid_only: license.prepaid_only,
	...(clearCustomize
		? { customize: null }
		: hasLicenseCustomize(license.customize)
			? { customize: license.customize }
			: {}),
});

const byLicensePlanId = <T extends { license_plan_id: string }>(
	left: T,
	right: T,
): number => left.license_plan_id.localeCompare(right.license_plan_id);

/** Link-field patch. `version` / expanded `plan` are display — ignored. */
export const diffPlanLicenses = ({
	from,
	to,
}: {
	from?: ApiPlanLicenseV1[];
	to?: ApiPlanLicenseV1[];
}): {
	upsert_licenses?: CustomizePlanLicense[];
	remove_licenses?: RemovePlanLicense[];
} => {
	const fromById = new Map(
		(from ?? []).map((license) => [license.license_plan_id, license]),
	);
	const toById = new Map(
		(to ?? []).map((license) => [license.license_plan_id, license]),
	);

	const upsert_licenses: CustomizePlanLicense[] = [];
	for (const toLicense of toById.values()) {
		const fromLicense = fromById.get(toLicense.license_plan_id);
		if (!fromLicense) continue;
		if (planLicensesAreSame({ left: fromLicense, right: toLicense })) {
			continue;
		}
		upsert_licenses.push(
			toUpsertLicense({
				license: toLicense,
				clearCustomize:
					fromLicense != null &&
					hasLicenseCustomize(fromLicense.customize) &&
					!hasLicenseCustomize(toLicense.customize),
			}),
		);
	}

	return {
		...(upsert_licenses.length > 0
			? { upsert_licenses: upsert_licenses.sort(byLicensePlanId) }
			: {}),
	};
};
