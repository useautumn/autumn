import { isAlienRequestError } from "@autumn/alien";
import { ErrCode, RecaseError } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";

/** The caller sees a generic 503, so alien's own status and reason are logged here, where they are known. */
export const alienErrorToByocUnavailable = ({ error }: { error: unknown }) => {
	if (!isAlienRequestError(error)) return error;
	const data = { path: error.path, status: error.status, detail: error.detail };
	logger.warn(
		`alien request failed: ${error.status ?? "unreachable"} on ${error.path}`,
		data,
	);
	return new RecaseError({
		message: "Atom is unavailable right now. Try again shortly.",
		code: ErrCode.ByocUnavailable,
		statusCode: 503,
		data,
		cause: error,
	});
};
