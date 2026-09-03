import type { BalancesLimitReached } from "@autumn/shared";
import { waitForWebhook } from "@tests/integration/utils/svixWebhookTestUtils.js";

export const LIMIT_REACHED_EVENT_TYPE = "balances.limit_reached";

export type LimitReachedWebhookPayload = {
	type: string;
	data: BalancesLimitReached;
};

export const waitForLimitReached = ({
	token,
	customerId,
	limitType,
	timeoutMs = 15000,
}: {
	token: string;
	customerId: string;
	limitType: string;
	timeoutMs?: number;
}) =>
	waitForWebhook<LimitReachedWebhookPayload>({
		token,
		predicate: (payload) =>
			payload.type === LIMIT_REACHED_EVENT_TYPE &&
			payload.data?.customer_id === customerId &&
			payload.data?.limit_type === limitType,
		timeoutMs,
	});
