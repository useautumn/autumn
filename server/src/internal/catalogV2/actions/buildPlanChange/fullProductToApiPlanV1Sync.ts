import {
	type Feature,
	type FullPlanLicense,
	type FullProductWithoutLicenses,
	mapToProductV2,
	productToPlanProcessors,
	productV2ToApiPlanV1,
} from "@autumn/shared";
import { toApiPlanLicenseSnapshot } from "@/internal/catalogV2/actions/buildPlanChange/buildPlanLicenseChanges/toApiPlanLicenseSnapshot";

export const fullProductToApiPlanV1Sync = ({
	product,
	features,
}: {
	product: FullProductWithoutLicenses & { licenses?: FullPlanLicense[] };
	features?: Feature[];
}) => {
	const resolvedFeatures =
		features ?? product.entitlements.map((entitlement) => entitlement.feature);
	const licenses = product.licenses ?? [];
	const plan = productV2ToApiPlanV1({
		product: mapToProductV2({ product, features: resolvedFeatures }),
		features: resolvedFeatures,
		...(licenses.length > 0
			? {
					licenses: licenses.map((license) =>
						toApiPlanLicenseSnapshot({ license }),
					),
				}
			: {}),
	});
	// Carried so the plan-change diff can report mapping edits.
	const processors = productToPlanProcessors({ product });
	return {
		...plan,
		...(processors !== undefined ? { processors } : {}),
	};
};
