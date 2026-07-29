import {
	ErrCode,
	type FullCusProduct,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";

/** Hard block for actions with no license support: any incoming plan
 * offering licenses, or any outgoing plan holding pools, rejects. */
export const handleUnsupportedLicenseActionErrors = ({
	actionLabel,
	fullProducts,
	customerProducts,
}: {
	actionLabel: string;
	fullProducts: (FullProduct | undefined)[];
	customerProducts: (FullCusProduct | undefined | null)[];
}) => {
	const hasIncomingLicenses = fullProducts.some(
		(product) => product?.licenses?.length,
	);
	const hasOutgoingLicenses = customerProducts.some(
		(customerProduct) => customerProduct?.customer_licenses?.length,
	);
	if (!hasIncomingLicenses && !hasOutgoingLicenses) return;

	throw new RecaseError({
		message: `${actionLabel} does not support license-backed plans yet.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
