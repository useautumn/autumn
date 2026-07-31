import { auth } from "@trigger.dev/sdk/v3";
import type { Logger } from "@/external/logtail/logtailUtils.js";

const CUSTOMER_EXPORT_REALTIME_TOKEN_TTL = "1hr";

/** Scoped to one run so the dashboard never sees more than its own export. */
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
