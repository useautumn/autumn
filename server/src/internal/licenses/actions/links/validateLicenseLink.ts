import { ErrCode, type FullProduct, RecaseError } from "@autumn/shared";
import { validateLicenseBillingMode } from "../../licenseUtils.js";

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
	if (licenseProduct.base_internal_product_id) {
		throw new RecaseError({
			message: `A variant cannot be used as a plan license (${licensePlanId ?? licenseProduct.id}).`,
			code: ErrCode.InvalidRequest,
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
