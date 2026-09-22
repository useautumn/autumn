import { TinybirdError } from "@tinybirdco/sdk";

/** A reply from Tinybird itself (any status), as opposed to a failure in the caller's own code. */
export const isTinybirdError = (cause: unknown): cause is TinybirdError =>
	cause instanceof TinybirdError;
