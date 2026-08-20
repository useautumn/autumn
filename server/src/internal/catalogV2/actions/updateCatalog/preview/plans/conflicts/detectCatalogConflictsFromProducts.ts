import type {
	CatalogConflictPreview,
	Feature,
	FullProductWithoutLicenses,
} from "@autumn/shared";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";
import { detectCatalogConflicts } from "./detectCatalogConflicts";

const featuresFromProducts = ({
	products,
}: {
	products: Array<FullProductWithoutLicenses | null | undefined>;
}): Feature[] =>
	products.flatMap(
		(product) =>
			product?.entitlements.map((entitlement) => entitlement.feature) ?? [],
	);

export const detectCatalogConflictsFromProducts = ({
	current,
	next,
	relative,
}: {
	current?: FullProductWithoutLicenses | null;
	next?: FullProductWithoutLicenses | null;
	relative?: FullProductWithoutLicenses | null;
}): CatalogConflictPreview[] => {
	if (current == null || next == null || relative == null) return [];
	const features = featuresFromProducts({
		products: [current, next, relative],
	});
	return detectCatalogConflicts({
		currentPlan: fullProductToApiPlanV1Sync({ product: current, features }),
		nextPlan: fullProductToApiPlanV1Sync({ product: next, features }),
		relativePlan: fullProductToApiPlanV1Sync({ product: relative, features }),
		features,
	});
};
