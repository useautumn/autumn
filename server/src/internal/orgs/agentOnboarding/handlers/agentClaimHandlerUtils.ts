import { ErrCode, RecaseError } from "@autumn/shared";

export const invalidAgentClaim = () =>
	new RecaseError({
		message: "Claim could not be completed",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

export const unauthenticatedAgentClaim = () =>
	new RecaseError({
		message: "Sign in to continue",
		code: ErrCode.NoAuthHeader,
		statusCode: 401,
	});
