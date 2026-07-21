import { ErrCode, RecaseError } from "@autumn/shared";

export const throwUnsupportedPooledAttach = ({
	message,
}: {
	message: string;
}): never => {
	throw new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
