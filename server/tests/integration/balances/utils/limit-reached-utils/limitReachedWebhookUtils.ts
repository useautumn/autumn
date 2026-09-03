import type { BalancesLimitReached } from "@autumn/shared";
import {
	getPlayHistory,
	parseEventBody,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";

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

export const countLimitReachedWebhooks = async ({
	token,
	customerId,
	limitType,
}: {
	token: string;
	customerId: string;
	limitType: string;
}) => {
	const history = await getPlayHistory({ token });
	let count = 0;
	for (const event of history.data) {
		try {
			const payload = parseEventBody<LimitReachedWebhookPayload>(event);
			if (
				payload.type === LIMIT_REACHED_EVENT_TYPE &&
				payload.data?.customer_id === customerId &&
				payload.data?.limit_type === limitType
			)
				count++;
		} catch {}
	}
	return count;
};
