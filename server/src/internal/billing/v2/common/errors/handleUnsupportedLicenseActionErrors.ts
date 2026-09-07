import {
	ErrCode,
	type FullCusProduct,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";

const throwUnsupportedLicenseAction = (actionLabel: string) => {
	throw new RecaseError({
		message: `${actionLabel} does not support license-backed plans yet.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

/** Rejects moving a customer off a plan whose license pools they still hold. */
export const handleUnsupportedOutgoingLicenseErrors = ({
	actionLabel,
	customerProducts,
}: {
	actionLabel: string;
	customerProducts: (FullCusProduct | undefined | null)[];
}) => {
	const holdsLicensePools = customerProducts.some(
		(customerProduct) => customerProduct?.customer_licenses?.length,
	);
	if (holdsLicensePools) throwUnsupportedLicenseAction(actionLabel);
};

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
	const offersLicenses = fullProducts.some(
		(product) => product?.licenses?.length,
	);
	if (offersLicenses) throwUnsupportedLicenseAction(actionLabel);

	handleUnsupportedOutgoingLicenseErrors({ actionLabel, customerProducts });
};
