import { ZodError } from "zod/v4";

export class InvalidPushError extends Error {
	override readonly name = "InvalidPushError";
}

export const isUnreadableRequest = (error: unknown): boolean =>
	error instanceof ZodError ||
	error instanceof SyntaxError ||
	error instanceof InvalidPushError;
