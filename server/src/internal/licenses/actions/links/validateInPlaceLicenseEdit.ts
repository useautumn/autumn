import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { validateLicenseLink } from "./validateLicenseLink.js";

/** In-place license edits mutate items under existing pinned links, so every
 * linked parent must still accept the new item state. Pure check — no writes. */
export const validateInPlaceLicenseEdit = async ({
	ctx,
	fromInternalProductId,
	newLicenseProduct,
}: {
	ctx: AutumnContext;
	fromInternalProductId: string;
	newLicenseProduct: FullProduct;
}) => {
	const links = await planLicenseRepo.listCatalogByLicenseInternalProductIds({
		db: ctx.db,
		licenseInternalProductIds: [fromInternalProductId],
	});
	const parentProducts = await Promise.all(
		links.map((link) =>
			getFullLicenseProduct({
				ctx,
				idOrInternalId: link.parent_internal_product_id,
			}),
		),
	);
	links.forEach((link, index) => {
		validateLicenseLink({
			parentProduct: parentProducts[index],
			licenseProduct: newLicenseProduct,
			prepaidOnly: link.prepaid_only,
			licensePlanId: newLicenseProduct.id,
		});
	});
};
