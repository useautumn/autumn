import {
	type CreatePlanItemParamsV1,
	ErrCode,
	type FullProduct,
	getLargestInterval,
	RecaseError,
} from "@autumn/shared";
import { validateLicenseBillingMode } from "../../licenseUtils.js";

/**
 * A priced license is attached at the customer level alongside the parent's
 * subscription, so their billing intervals must line up. Free products (no
 * recurring price) always pass.
 */
const validateMatchingBillingIntervals = ({
	parentProduct,
	licenseProduct,
}: {
	parentProduct: FullProduct;
	licenseProduct: FullProduct;
}) => {
	const parentInterval = getLargestInterval({
		prices: parentProduct.prices,
		excludeOneOff: true,
	});
	const licenseInterval = getLargestInterval({
		prices: licenseProduct.prices,
		excludeOneOff: true,
	});
	if (!parentInterval || !licenseInterval) return;

	const matches =
		parentInterval.interval === licenseInterval.interval &&
		parentInterval.intervalCount === licenseInterval.intervalCount;
	if (matches) return;

	throw new RecaseError({
		message: `License plan ${licenseProduct.id} bills ${licenseInterval.interval} but ${parentProduct.id} bills ${parentInterval.interval}. Billing intervals must match.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

const rejectPooledItems = ({
	customizeItems,
}: {
	customizeItems?: CreatePlanItemParamsV1[];
}) => {
	const hasPooled = (customizeItems ?? []).some((item) => item.pooled === true);
	if (!hasPooled) return;

	throw new RecaseError({
		message:
			"Pooled license features are not yet available. Remove pooled from the license items.",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

/**
 * Every rule a parent→license link must satisfy. licenseProduct is the
 * effective product; parent-dependent checks run only when parentProduct is
 * present, billing mode only when prepaidOnly is present, archived only when
 * licensePlanId is present.
 */
export const validateLicenseLink = ({
	parentProduct,
	licenseProduct,
	prepaidOnly,
	licensePlanId,
	customizeItems,
}: {
	parentProduct?: FullProduct;
	licenseProduct: FullProduct;
	prepaidOnly?: boolean;
	licensePlanId?: string;
	customizeItems?: CreatePlanItemParamsV1[];
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
	if (parentProduct) {
		if (licenseProduct.id === parentProduct.id) {
			throw new RecaseError({
				message: `A plan cannot be linked as a license to itself (${licensePlanId ?? licenseProduct.id}).`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		validateMatchingBillingIntervals({ parentProduct, licenseProduct });
	}
	rejectPooledItems({ customizeItems });
};
