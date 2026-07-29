import { isDeepStrictEqual } from "node:util";
import type { DbPlanLicense, PlanLicenseParams } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { planLicenseRepo } from "@/internal/licenses/repos/planLicenseRepo.js";

type ItemCustomizationMode = "preserve" | "clear" | "replace";

const planLicenseWillChange = ({
	current,
	entry,
	included,
	prepaidOnly,
	itemCustomizationMode,
}: {
	current: DbPlanLicense;
	entry: PlanLicenseParams;
	included: number;
	prepaidOnly: boolean;
	itemCustomizationMode: ItemCustomizationMode;
}) =>
	current.included !== included ||
	current.prepaid_only !== prepaidOnly ||
	(entry.metadata !== undefined &&
		!isDeepStrictEqual(current.metadata ?? {}, entry.metadata)) ||
	itemCustomizationMode === "replace" ||
	(itemCustomizationMode === "clear" && current.customized);

/** Retires a changed catalog link when a customer still references its definition. */
export const retireCatalogPlanLicenseIfReferenced = async ({
	db,
	current,
	entry,
	included,
	prepaidOnly,
	itemCustomizationMode,
	hasCustomerReference,
}: {
	db: DrizzleCli;
	current: DbPlanLicense;
	entry: PlanLicenseParams;
	included: number;
	prepaidOnly: boolean;
	itemCustomizationMode: ItemCustomizationMode;
	hasCustomerReference: boolean;
}) => {
	if (
		!planLicenseWillChange({
			current,
			entry,
			included,
			prepaidOnly,
			itemCustomizationMode,
		})
	) {
		return;
	}

	if (!hasCustomerReference) return;

	await planLicenseRepo.retireCatalogById({ db, id: current.id });
};
