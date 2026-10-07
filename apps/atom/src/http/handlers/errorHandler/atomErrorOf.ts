import { isUnreadableRequest } from "../../../lib/contracts/invalidPushError.js";

export type AtomErrorStatus = 400 | 500;

/** How a failure Atom answers itself is told to the caller: the status and error body, in the API's own shape. */
export const atomErrorOf = ({
	cause,
}: {
	cause: Error;
}): { status: AtomErrorStatus; code: string; message: string } => {
	// A push Atom cannot read is the sender's to fix.
	if (isUnreadableRequest(cause))
		return { status: 400, code: "invalid_request", message: cause.message };
	return {
		status: 500,
		code: "internal_error",
		message: "Atom could not answer",
	};
};
