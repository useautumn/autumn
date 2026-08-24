import {
	diffPlanV1,
	type FullProductWithoutLicenses,
	type LicenseCustomize,
	PlanItemFilterPrecision,
} from "@autumn/shared";
import { toMigratableCustomize } from "@/internal/catalogV2/actions/buildMigrationDraft/toMigratableCustomize";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange";

/** Effective content delta of one license link, or null when the overlay is unchanged. */
export const licenseEffectiveMigratableCustomize = ({
	fromProduct,
	toProduct,
}: {
	fromProduct: FullProductWithoutLicenses;
	toProduct: FullProductWithoutLicenses;
}): LicenseCustomize | null => {
	const customize = toMigratableCustomize({
		customize: diffPlanV1({
			from: fullProductToApiPlanV1Sync({ product: fromProduct }),
			to: fullProductToApiPlanV1Sync({ product: toProduct }),
			filterPrecision: PlanItemFilterPrecision.IdentityAndIncluded,
		}),
	});
	const { price, add_items, remove_items } = customize;
	const nested = {
		...(price !== undefined ? { price } : {}),
		...(add_items !== undefined ? { add_items } : {}),
		...(remove_items !== undefined ? { remove_items } : {}),
	};
	if (Object.keys(nested).length === 0) return null;
	return nested;
};
