import { ms } from "@autumn/shared";
import { auth } from "@trigger.dev/sdk/v3";
import { addMilliseconds, isPast } from "date-fns";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { getCustomerExportErrorMessage } from "./customerExportErrorMessage.js";

const CUSTOMER_EXPORT_REALTIME_TOKEN_TTL = "1hr";
// Reuse tokens below their one-hour TTL so list refetches do not rotate the
// token and remount the realtime subscription.
const TOKEN_REUSE_WINDOW_MS = ms.minutes(50);

type CachedToken = { token: string; expiresAt: Date };
const cachedTokensByRunId = new Map<string, CachedToken>();

const tokenReuseExpiry = () =>
	addMilliseconds(new Date(), TOKEN_REUSE_WINDOW_MS);

const pruneExpiredTokens = () => {
	for (const [runId, cached] of cachedTokensByRunId) {
		if (isPast(cached.expiresAt)) cachedTokensByRunId.delete(runId);
	}
};

export const cacheCustomerExportRealtimeToken = ({
	triggerRunId,
	token,
}: {
	triggerRunId: string;
	token: string;
}) => {
	pruneExpiredTokens();
	cachedTokensByRunId.set(triggerRunId, {
		token,
		expiresAt: tokenReuseExpiry(),
	});
};

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
		cachedTokensByRunId.set(triggerRunId, {
			token,
			expiresAt: tokenReuseExpiry(),
		});
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
