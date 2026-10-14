import { LockAlreadyExistsError } from "@autumn/balance-engine";
import { ErrCode } from "@autumn/shared";
import { isUnreadableRequest } from "../../../lib/contracts/invalidPushError.js";
import { LockTermsConflictError } from "../../../processor/actions/track/lockTerms.js";
import { OwnerUnavailableError } from "../../../threads/owners/ownerUnavailableError.js";
import { AtomApiError } from "./atomApiError.js";

export type AtomErrorStatus = 400 | 409 | 500 | 503;

export type AtomError = {
	status: AtomErrorStatus;
	code: string;
	message: string;
};

/** How a failure Atom answers itself is told to the caller: the status and error body, in the API's own shape. */
export const atomErrorOf = ({ cause }: { cause: Error }): AtomError => {
	if (cause instanceof AtomApiError) return cause.answer;
	// A push Atom cannot read is the sender's to fix.
	if (isUnreadableRequest(cause))
		return { status: 400, code: "invalid_request", message: cause.message };
	// D2, worker parity: a lock_id retried while its lock is open is refused as the API refuses it.
	if (cause instanceof LockAlreadyExistsError)
		return {
			status: 409,
			code: ErrCode.LockAlreadyExists,
			message: "A lock with this ID already exists",
		};
	if (cause instanceof LockTermsConflictError)
		return {
			status: 409,
			code: ErrCode.LockAlreadyExists,
			message: "lock_id already used with different terms",
		};
	// Passes once the thread is back: Autumn's server asks its API meanwhile, and a push is sent again.
	if (cause instanceof OwnerUnavailableError)
		return { status: 503, code: "atom_unavailable", message: cause.message };
	return {
		status: 500,
		code: "internal_error",
		message: "Atom could not answer",
	};
};
