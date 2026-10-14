import {
	ErrCode,
	RecaseError,
	type SetPlansErrorDetails,
	setPlansErrorCopy,
	setPlansErrorCopyToText,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const setPlansError = ({
	details,
	code = ErrCode.InvalidRequest,
}: {
	details: SetPlansErrorDetails;
	code?: string;
}) =>
	new RecaseError({
		code,
		statusCode: StatusCodes.BAD_REQUEST,
		message: setPlansErrorCopyToText(setPlansErrorCopy(details)),
		details,
	});
