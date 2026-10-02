import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const invalidSetPlansRequest = (message: string) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
