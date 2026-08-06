import { ErrCode, type ProductItem, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";

const pooledFeatureIds = (items: ProductItem[]) =>
	new Set(
		items
			.filter((item) => item.pooled && item.feature_id)
			.map((item) => item.feature_id as string),
	);

/** A plan offered as a license may not carry pooled items. Rejected at the point
 * the item is added so the parent plans linking to it stay versionable — otherwise
 * the pooled item only surfaces later, as a failure on an unrelated parent.
 * Only newly added pooled features are rejected: plans already in this state
 * predate the check and must stay editable. */
export const validatePooledItemsOnLicensePlan = async ({
	db,
	internalProductId,
	planId,
	newItems,
	currentItems,
}: {
	db: DrizzleCli;
	internalProductId: string;
	planId: string;
	newItems: ProductItem[];
	currentItems: ProductItem[];
}) => {
	const currentPooled = pooledFeatureIds(currentItems);
	const addedPooled = [...pooledFeatureIds(newItems)].filter(
		(featureId) => !currentPooled.has(featureId),
	);
	if (addedPooled.length === 0) return;

	const parentLinks =
		await planLicenseRepo.listCatalogByLicenseInternalProductIds({
			db,
			licenseInternalProductIds: [internalProductId],
		});
	if (parentLinks.length === 0) return;

	throw new RecaseError({
		message: `Pooled items are not supported for plan licenses (${planId}).`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
