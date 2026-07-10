import type {
	Feature,
	FullProduct,
	Organization,
	Product,
	ProductV2,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { validateCopiedPlanLicenses } from "@/internal/licenses/actions/links/copyPlanLicensesToNewVersion.js";
import { validateRolledForwardLicenses } from "@/internal/licenses/actions/links/rollForwardLicenseProductVersion.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";

/**
 * License links must still satisfy the link rules against a product's NEW
 * item state before it is persisted — otherwise an interval change (or archive)
 * silently invalidates a link. Runs for both versioning and in-place edits.
 * `fromInternalProductId` is the edited product; `baseProduct` supplies the
 * non-item fields (a fresh version's shell, or the current product row).
 */
export const validateProductLicenseLinks = async ({
	ctx,
	fromInternalProductId,
	newProductV2,
	baseProduct,
	org,
	features,
}: {
	ctx: AutumnContext;
	fromInternalProductId: string;
	newProductV2: ProductV2;
	baseProduct: Product;
	org: Organization;
	features: Feature[];
}) => {
	const { prices, entitlements } = convertProductV2ToV1({
		productV2: newProductV2,
		orgId: org.id,
		features,
	});
	const newFullProduct: FullProduct = {
		...baseProduct,
		prices,
		entitlements: getEntsWithFeature({
			ents: Object.values(entitlements),
			features,
		}),
		free_trial: null,
	};

	await validateCopiedPlanLicenses({
		ctx,
		fromInternalProductId,
		newParentProduct: newFullProduct,
	});
	await validateRolledForwardLicenses({
		ctx,
		fromInternalProductId,
		newLicenseProduct: newFullProduct,
	});
};
