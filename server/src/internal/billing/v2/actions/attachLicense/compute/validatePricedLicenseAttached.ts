import {
	type DbCustomerProduct,
	type DbPlanLicense,
	ErrCode,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resolveEffectiveLicenseProduct } from "@/internal/licenses/actions/customize/resolveEffectiveLicenseProduct.js";

/** Assignment never bills: a priced license must already be attached at the
 * customer level (normal billing.attach) before it can be assigned. The
 * customer-level product is resolved in setup so this stays a pure check. */
export const validatePricedLicenseAttached = async ({
	ctx,
	licenseProduct,
	licenseDefinition,
	customerLevelProduct,
}: {
	ctx: AutumnContext;
	licenseProduct: FullProduct;
	licenseDefinition: DbPlanLicense;
	customerLevelProduct?: DbCustomerProduct;
}) => {
	const effectiveProduct = await resolveEffectiveLicenseProduct({
		ctx,
		licenseProduct,
		planLicenseId: licenseDefinition.id,
	});
	if (effectiveProduct.prices.length === 0) return;

	if (!customerLevelProduct) {
		throw new RecaseError({
			message: `License plan ${licenseProduct.id} has priced items. Attach it to the customer with billing.attach before assigning.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
