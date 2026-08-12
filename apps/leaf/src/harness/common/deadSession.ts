const SESSION_NOT_FOUND_STATUS = 404;
const MISSING_SESSION_MESSAGE = /session[^:]*not found|no such session/i;
// A malformed persisted id is rejected with 400 before any existence check;
// it can never resume, so it is as dead as a 404.
const INVALID_SESSION_MESSAGE = /invalid session id/i;

/** True when a sessions API call failed because the persisted session id can
 * never resume — unknown (deleted/expired server-side) or malformed. */
export const isMissingSessionApiError = (error: unknown) => {
	if (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		(error as { status?: unknown }).status === SESSION_NOT_FOUND_STATUS
	) {
		return true;
	}
	return (
		error instanceof Error &&
		(MISSING_SESSION_MESSAGE.test(error.message) ||
			INVALID_SESSION_MESSAGE.test(error.message))
	);
};
