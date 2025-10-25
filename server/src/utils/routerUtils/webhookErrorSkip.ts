import type { Logger } from "../../external/logtail/logtailUtils.js";

/**
 * Checks if a webhook error should be skipped (not logged).
 * Returns true if error should be skipped, false otherwise.
 */
export const handleWebhookErrorSkip = ({
	error,
	logger,
}: {
	error: any;
	logger?: Logger;
}): boolean => {
	const errorMessage = String(error);

	// Skip "live mode key used" errors
	if (
		errorMessage.includes("but a live mode key was used to make this request.")
	) {
		return true;
	}

	// Skip "Not a valid URL" errors
	if (errorMessage.includes("Not a valid URL")) {
		logger?.warn("Webhook error: Not a valid URL");
		return true;
	}

	// Don't skip this error
	return false;
};
