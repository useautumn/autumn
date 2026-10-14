import { TinybirdApiError, TinybirdError } from "@tinybirdco/sdk";

export const isTinybirdError = (
	cause: unknown,
): cause is TinybirdApiError | TinybirdError =>
	cause instanceof TinybirdApiError || cause instanceof TinybirdError;
