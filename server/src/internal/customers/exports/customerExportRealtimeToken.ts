import { ms } from "@autumn/shared";
import { auth } from "@trigger.dev/sdk/v3";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { getCustomerExportErrorMessage } from "./customerExportErrorMessage.js";

const CUSTOMER_EXPORT_REALTIME_TOKEN_TTL = "1hr";
// Reused until close to expiry so 5s polls don't mint a trigger.dev token (and
// remount the client's realtime subscription) on every request.
const TOKEN_REUSE_WINDOW_MS = ms.minutes(50);

type CachedToken = { token: string; mintedAt: number };
const cachedTokensByRunId = new Map<string, CachedToken>();

const pruneExpiredTokens = () => {
	const now = Date.now();
	for (const [runId, cached] of cachedTokensByRunId) {
		if (now - cached.mintedAt >= TOKEN_REUSE_WINDOW_MS) {
			cachedTokensByRunId.delete(runId);
		}
	}
};

/** Scoped to one run so the dashboard never sees more than its own export. */
export const createCustomerExportRealtimeToken = async ({
	triggerRunId,
	logger,
}: {
	triggerRunId: string;
	logger: Logger;
}): Promise<string | null> => {
	pruneExpiredTokens();
	const cached = cachedTokensByRunId.get(triggerRunId);
	if (cached) return cached.token;

	try {
		const token = await auth.createPublicToken({
			scopes: { read: { runs: [triggerRunId] } },
			expirationTime: CUSTOMER_EXPORT_REALTIME_TOKEN_TTL,
		});
		cachedTokensByRunId.set(triggerRunId, { token, mintedAt: Date.now() });
		return token;
	} catch (error) {
		// Realtime is an optimisation over polling, so a token failure is not fatal.
		logger.warn("customer-export: failed to create realtime access token", {
			data: {
				triggerRunId,
				error: getCustomerExportErrorMessage({ error }),
			},
		});
		return null;
	}
};
