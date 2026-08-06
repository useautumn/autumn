import { ErrCode, type ProductItem, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";

/** A plan offered as a license may not carry pooled items. Rejected at the point
 * the item is added so the parent plans linking to it stay versionable — otherwise
 * the pooled item only surfaces later, as a failure on an unrelated parent. */
export const validatePooledItemsOnLicensePlan = async ({
	db,
	internalProductId,
	planId,
	newItems,
}: {
	db: DrizzleCli;
	internalProductId: string;
	planId: string;
	newItems: ProductItem[];
}) => {
	if (!newItems.some((item) => item.pooled)) return;

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
