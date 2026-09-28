import {
	getPlayHistory,
	parseEventBody,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";
import { timeout } from "@tests/utils/genUtils.js";

export type ThresholdReachedPayload = {
	type: string;
	data: {
		threshold_type: "limit_reached" | "allowance_used";
		customer: {
			id: string;
			autumn_id?: string;
			invoices?: unknown;
			features?: Record<string, { balance?: number | null }>;
		};
		feature: { id: string };
	};
};

/** How long a test waits to be sure a webhook it expects NOT to arrive really did not. */
export const NO_WEBHOOK_WAIT_MS = 8_000;

const isCustomerThresholdReached = ({
	payload,
	customerId,
}: {
	payload: ThresholdReachedPayload;
	customerId: string;
}): boolean =>
	payload.type === "customer.threshold_reached" &&
	payload.data?.customer?.id === customerId;

/** Polls Svix Play for this customer's `customer.threshold_reached`; null when none arrives in time. */
export const waitForThresholdReachedWebhook = async ({
	playToken,
	customerId,
	timeoutMs = 15_000,
}: {
	playToken: string;
	customerId: string;
	timeoutMs?: number;
}): Promise<ThresholdReachedPayload["data"] | null> => {
	const result = await waitForWebhook<ThresholdReachedPayload>({
		token: playToken,
		predicate: (payload) => isCustomerThresholdReached({ payload, customerId }),
		timeoutMs,
	});
	return result?.payload.data ?? null;
};

/** Every `customer.threshold_reached` the customer received, after giving late deliveries time to land. */
export const listThresholdReachedWebhooks = async ({
	playToken,
	customerId,
	settleMs = 3_000,
}: {
	playToken: string;
	customerId: string;
	settleMs?: number;
}): Promise<ThresholdReachedPayload["data"][]> => {
	await timeout(settleMs);
	const history = await getPlayHistory({ token: playToken });
	return history.data.flatMap((event) => {
		try {
			const payload = parseEventBody<ThresholdReachedPayload>(event);
			return isCustomerThresholdReached({ payload, customerId })
				? [payload.data]
				: [];
		} catch {
			return [];
		}
	});
};
