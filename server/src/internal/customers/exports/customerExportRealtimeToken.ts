import { auth } from "@trigger.dev/sdk/v3";
import type { Logger } from "@/external/logtail/logtailUtils.js";

/** A run can outlive its token, and an expired one silently stops delivering
 * updates — so this must exceed the task's own maxDuration. */
const CUSTOMER_EXPORT_REALTIME_TOKEN_TTL = "25hr";

export const createCustomerExportRealtimeToken = async ({
	triggerRunId,
	logger,
}: {
	triggerRunId: string;
	logger: Logger;
}): Promise<string | null> => {
	try {
		return await auth.createPublicToken({
			scopes: { read: { runs: [triggerRunId] } },
			expirationTime: CUSTOMER_EXPORT_REALTIME_TOKEN_TTL,
		});
	} catch (error) {
		// Realtime is an optimisation over polling, so a token failure is not fatal.
		logger.warn("customer-export: failed to create realtime access token", {
			data: {
				triggerRunId,
				error: error instanceof Error ? error.message : String(error),
			},
		});
		return null;
	}
};
