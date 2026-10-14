import type { Logger } from "../../external/logtail/logtailUtils.js";

export const handleWebhookErrorSkip = ({
	error,
	logger,
}: {
	error: any;
	logger?: Logger;
}): boolean => {
	const errorMessage = String(error);

	if (
		errorMessage.includes("but a live mode key was used to make this request.")
	) {
		return true;
	}

	if (errorMessage.includes("Not a valid URL")) {
		logger?.warn("Webhook error: Not a valid URL");
		return true;
	}

	return false;
};
