import {
	ADDS_AND_REMOVES_SAME_REWARD_MESSAGE,
	type AttachParamsV1,
	addsAndRemovesSameReward,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

const throwInvalidRequest = (message: string) => {
	throw new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

export const handleRemoveDiscountsErrors = ({
	params,
}: {
	params: AttachParamsV1;
}) => {
	if (addsAndRemovesSameReward(params)) {
		throwInvalidRequest(ADDS_AND_REMOVES_SAME_REWARD_MESSAGE);
	}

	const removesDiscounts = (params.remove_discounts?.length ?? 0) > 0;
	if (removesDiscounts && params.no_billing_changes) {
		throwInvalidRequest(
			"Cannot remove discounts with no_billing_changes, since it skips all Stripe updates.",
		);
	}
};
