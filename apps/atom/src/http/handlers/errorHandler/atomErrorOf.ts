import { isUnreadableRequest } from "../../../lib/contracts/invalidPushError.js";
import { OwnerUnavailableError } from "../../../threads/owners/ownerUnavailableError.js";

export type AtomErrorStatus = 400 | 500 | 503;

export const atomErrorOf = ({
	cause,
}: {
	cause: Error;
}): { status: AtomErrorStatus; code: string; message: string } => {
	if (isUnreadableRequest(cause))
		return { status: 400, code: "invalid_request", message: cause.message };
	if (cause instanceof OwnerUnavailableError)
		return { status: 503, code: "atom_unavailable", message: cause.message };
	return {
		status: 500,
		code: "internal_error",
		message: "Atom could not answer",
	};
};
