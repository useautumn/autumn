import type { CatalogConflictPreview, FullProduct } from "@autumn/shared";
import { detectCatalogConflictsFromProducts } from "./detectCatalogConflictsFromProducts";

const licensesByPlanId = ({
	product,
}: {
	product: FullProduct;
}): Map<string, NonNullable<FullProduct["licenses"]>[number]> =>
	new Map((product.licenses ?? []).map((link) => [link.product.id, link]));

/** Same detector as the plan body, once per shared license link. Stamps `license_plan_id`. */
export const detectLicenseSlotConflicts = ({
	current,
	next,
	relative,
}: {
	current?: FullProduct | null;
	next?: FullProduct | null;
	relative?: FullProduct | null;
}): CatalogConflictPreview[] => {
	if (current == null || next == null || relative == null) return [];

	const currentById = licensesByPlanId({ product: current });
	const nextById = licensesByPlanId({ product: next });
	const relativeById = licensesByPlanId({ product: relative });

	const licensePlanIds = [
		...new Set([...currentById.keys(), ...nextById.keys()]),
	]
		.filter((licensePlanId) => relativeById.has(licensePlanId))
		.sort();

	return licensePlanIds.flatMap((licensePlanId) =>
		detectCatalogConflictsFromProducts({
			current: currentById.get(licensePlanId)?.product,
			next: nextById.get(licensePlanId)?.product,
			relative: relativeById.get(licensePlanId)?.product,
		}).map((conflict) => ({ ...conflict, license_plan_id: licensePlanId })),
	);
};
