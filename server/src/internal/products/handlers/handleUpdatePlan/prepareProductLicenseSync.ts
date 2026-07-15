import type {
	Feature,
	Organization,
	PlanLicenseParams,
	Product,
	ProductV2,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { validateCopiedPlanLicenses } from "@/internal/licenses/actions/links/copyPlanLicensesToNewVersion.js";
import { preparePlanLicenseSync } from "@/internal/licenses/actions/links/syncPlanLicenses.js";
import { buildFullProductFromV2 } from "@/internal/products/productUtils/productV2Utils/buildFullProductFromV2.js";

/**
 * Parent-side link guard: the plan's outgoing license links must still satisfy
 * the link rules against its NEW item state before it is persisted — otherwise
 * an interval change silently invalidates a link. Runs for both versioning and
 * in-place edits.
 */
export const prepareProductLicenseSync = async ({
	ctx,
	fromInternalProductId,
	newProductV2,
	baseProduct,
	org,
	features,
	licenses,
	newParentVersion = false,
}: {
	ctx: AutumnContext;
	fromInternalProductId: string;
	newProductV2: ProductV2;
	baseProduct: Product;
	org: Organization;
	features: Feature[];
	licenses?: PlanLicenseParams[];
	newParentVersion?: boolean;
}) => {
	const newFullProduct = buildFullProductFromV2({
		product: newProductV2,
		base: baseProduct,
		org,
		features,
	});

	if (licenses !== undefined) {
		return preparePlanLicenseSync({
			ctx,
			parentProduct: newFullProduct,
			licenses,
			fromInternalProductId,
			newParentVersion,
		});
	}

	await validateCopiedPlanLicenses({
		ctx,
		fromInternalProductId,
		newParentProduct: newFullProduct,
	});
	return undefined;
};
