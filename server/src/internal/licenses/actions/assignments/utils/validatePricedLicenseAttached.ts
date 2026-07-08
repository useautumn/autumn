import {
	type DbPlanLicense,
	ErrCode,
	type FullCustomer,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { licenseAssignmentRepo } from "../../../repos/licenseAssignmentRepo.js";
import { resolveEffectiveLicenseProduct } from "../../customize/resolveEffectiveLicenseProduct.js";

/** Assignment never bills: a priced license must already be attached at the
 * customer level (normal billing.attach) before it can be assigned. */
export const validatePricedLicenseAttached = async ({
	ctx,
	fullCustomer,
	licenseProduct,
	licenseDefinition,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	licenseProduct: FullProduct;
	licenseDefinition: DbPlanLicense;
}) => {
	const effectiveProduct = await resolveEffectiveLicenseProduct({
		ctx,
		licenseProduct,
		planLicenseId: licenseDefinition.id,
	});
	if (effectiveProduct.prices.length === 0) return;

	const customerLevelProduct =
		await licenseAssignmentRepo.findLatestActiveCustomerLevelCustomerProduct({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
			internalProductId: licenseProduct.internal_id,
		});
	if (!customerLevelProduct) {
		throw new RecaseError({
			message: `License plan ${licenseProduct.id} has priced items. Attach it to the customer with billing.attach before assigning.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
