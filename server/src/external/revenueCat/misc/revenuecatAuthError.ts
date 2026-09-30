import { ErrCode, RecaseError } from "@autumn/shared";

export const revenuecatAuthError = ({ detail }: { detail: string }) =>
	new RecaseError({
		message: `RevenueCat rejected Autumn's credentials (${detail}). Reconnect RevenueCat to continue.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
