import { ErrCode, RecaseError } from "@autumn/shared";

/** alien or the stack's Atom did not answer; the watch waits it out rather than failing. */
export const isAtomUnavailableError = (error: unknown): boolean =>
	error instanceof RecaseError && error.code === ErrCode.ByocUnavailable;
