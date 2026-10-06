import { ZodError } from "zod/v4";
import { OwnerUnavailableError } from "../../../threads/owners/ownerUnavailableError.js";

export type AtomErrorStatus = 400 | 500 | 503;

/** How a failure Atom answers itself is told to the caller: the status and error body, in the API's own shape. */
export const atomErrorOf = ({
	cause,
}: {
	cause: Error;
}): { status: AtomErrorStatus; code: string; message: string } => {
	// A push Atom cannot read is the sender's to fix.
	if (cause instanceof ZodError || cause instanceof SyntaxError)
		return { status: 400, code: "invalid_request", message: cause.message };
	// Passes once the thread is back: Autumn's server asks its API meanwhile, and a push is sent again.
	if (cause instanceof OwnerUnavailableError)
		return { status: 503, code: "atom_unavailable", message: cause.message };
	return {
		status: 500,
		code: "internal_error",
		message: "Atom could not answer",
	};
};
