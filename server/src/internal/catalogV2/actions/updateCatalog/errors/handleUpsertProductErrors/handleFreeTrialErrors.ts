import {
	ErrCode,
	type FullProduct,
	isOneOffProduct,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

/** Reject free trials on one-off products (nothing recurring to trial). */
export const handleFreeTrialErrors = ({
	nextFullProduct,
}: {
	nextFullProduct: FullProduct;
}): void => {
	if (!nextFullProduct.free_trial) return;

	if (isOneOffProduct({ prices: nextFullProduct.prices })) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: "One-off products cannot have a free trial",
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
