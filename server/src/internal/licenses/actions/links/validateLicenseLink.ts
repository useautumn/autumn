import { ErrCode, type FullProduct, RecaseError } from "@autumn/shared";
import { validateLicenseBillingMode } from "../../licenseUtils.js";

/**
 * Every rule a parent→license link must satisfy. Parent-dependent checks run
 * only when parentProduct is present, billing mode only when prepaidOnly is
 * present, archived only when licensePlanId is present.
 */
export const validateLicenseLink = ({
	parentProduct,
	licenseProduct,
	prepaidOnly,
	licensePlanId,
}: {
	parentProduct?: FullProduct;
	licenseProduct: FullProduct;
	prepaidOnly?: boolean;
	licensePlanId?: string;
}) => {
	if (prepaidOnly !== undefined) {
		validateLicenseBillingMode({ prepaidOnly });
	}
	if (licensePlanId && licenseProduct.archived) {
		throw new RecaseError({
			message: `License plan ${licensePlanId} is archived and cannot be linked.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (parentProduct && licenseProduct.id === parentProduct.id) {
		throw new RecaseError({
			message: `A plan cannot be linked as a license to itself (${licensePlanId ?? licenseProduct.id}).`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};
