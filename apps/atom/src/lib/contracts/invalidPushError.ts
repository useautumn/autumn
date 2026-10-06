import { ZodError } from "zod/v4";

/** A push Atom will never apply, however often it is sent: a 400 over HTTP, and dropped from the queue. */
export class InvalidPushError extends Error {
	override readonly name = "InvalidPushError";
}

/** A body Atom cannot read, or one it refused: the sender's to fix, not a failure that may pass. */
export const isUnreadableRequest = (error: unknown): boolean =>
	error instanceof ZodError ||
	error instanceof SyntaxError ||
	error instanceof InvalidPushError;
