import { ErrCode, RecaseError } from "@autumn/shared";

/** Rules record who saved them, so only a signed-in member can write one. */
export const handleRuleAuthorErrors = ({
	userId,
}: {
	userId: string | undefined;
}): string => {
	if (userId) return userId;

	throw new RecaseError({
		message: "Approval rules can only be changed from the dashboard.",
		code: ErrCode.InvalidRequest,
		statusCode: 401,
	});
};
