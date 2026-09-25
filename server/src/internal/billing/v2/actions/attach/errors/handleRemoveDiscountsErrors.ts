import {
	ADDS_AND_REMOVES_SAME_REWARD_MESSAGE,
	type AttachParamsV1,
	addsAndRemovesSameReward,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const handleRemoveDiscountsErrors = ({
	params,
}: {
	params: AttachParamsV1;
}) => {
	if (!addsAndRemovesSameReward(params)) return;

	throw new RecaseError({
		message: ADDS_AND_REMOVES_SAME_REWARD_MESSAGE,
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
