import type {
	Feature,
	FullProduct,
	Organization,
	Product,
	ProductV2,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { validateCopiedPlanLicenses } from "@/internal/licenses/actions/links/copyPlanLicensesToNewVersion.js";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";

/** The product's post-edit item state as an in-memory FullProduct, so link
 * rules can be checked before anything is persisted. */
export const buildFullProductFromV2 = ({
	newProductV2,
	baseProduct,
	org,
	features,
}: {
	newProductV2: ProductV2;
	baseProduct: Product;
	org: Organization;
	features: Feature[];
}): FullProduct => {
	const { prices, entitlements } = convertProductV2ToV1({
		productV2: newProductV2,
		orgId: org.id,
		features,
	});
	return {
		...baseProduct,
		prices,
		entitlements: getEntsWithFeature({
			ents: Object.values(entitlements),
			features,
		}),
		free_trial: null,
	};
};

/**
 * Parent-side link guard: the plan's outgoing license links must still satisfy
 * the link rules against its NEW item state before it is persisted — otherwise
 * an interval change silently invalidates a link. Runs for both versioning and
 * in-place edits.
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
	const newFullProduct = buildFullProductFromV2({
		newProductV2,
		baseProduct,
		org,
		features,
	});

	await validateCopiedPlanLicenses({
		ctx,
		fromInternalProductId,
		newParentProduct: newFullProduct,
	});
};
