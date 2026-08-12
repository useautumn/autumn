const SESSION_NOT_FOUND_STATUS = 404;
const MISSING_SESSION_MESSAGE = /session[^:]*not found|no such session/i;

/** True when a sessions API call failed because the session id is unknown —
 * the persisted session was deleted or expired server-side. */
export const isMissingSessionApiError = (error: unknown) => {
	if (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		(error as { status?: unknown }).status === SESSION_NOT_FOUND_STATUS
	) {
		return true;
	}
	return error instanceof Error && MISSING_SESSION_MESSAGE.test(error.message);
};
