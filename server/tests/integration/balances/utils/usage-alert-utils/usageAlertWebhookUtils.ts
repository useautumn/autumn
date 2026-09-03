import { expect } from "bun:test";
import {
	getPlayHistory,
	parseEventBody,
	waitForWebhook,
} from "@tests/integration/utils/svixWebhookTestUtils.js";

export const USAGE_ALERT_EVENT_TYPE = "balances.usage_alert_triggered";

export type UsageAlertWebhookPayload = {
	type: string;
	data: {
		customer_id: string;
		feature_id: string;
		entity_id?: string;
		usage_alert: {
			name?: string;
			threshold: number;
			threshold_type: string;
			basis: string;
			filter?: { properties: Record<string, string> };
		};
		balance?: {
			usage: number;
			granted: number;
			included: number;
			remaining: number;
		};
		usage_limit?: {
			limit: number;
			interval: string;
			anchor: string;
			usage: number;
			remaining: number;
			window_start_at: number;
			window_end_at: number;
		};
	};
};

type UsageAlertMatch = {
	customerId: string;
	threshold: number;
	basis?: string;
	entityId?: string;
	filterKey?: string;
};

const filterKeyOf = (
	filter: UsageAlertWebhookPayload["data"]["usage_alert"]["filter"],
) =>
	filter
		? Object.entries(filter.properties)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, value]) => `${key}=${value}`)
				.join("&")
		: "";

const matchesUsageAlert =
	(match: UsageAlertMatch) => (payload: UsageAlertWebhookPayload) => {
		const alert = payload.data?.usage_alert;
		if (payload.type !== USAGE_ALERT_EVENT_TYPE) return false;
		if (payload.data?.customer_id !== match.customerId) return false;
		if (alert?.threshold !== match.threshold) return false;
		if (match.basis && alert.basis !== match.basis) return false;
		if (match.entityId && payload.data.entity_id !== match.entityId)
			return false;
		if (
			match.filterKey !== undefined &&
			filterKeyOf(alert.filter) !== match.filterKey
		)
			return false;
		return true;
	};

export const waitForUsageAlert = async ({
	token,
	timeoutMs = 15000,
	...match
}: UsageAlertMatch & { token: string; timeoutMs?: number }) => {
	const result = await waitForWebhook<UsageAlertWebhookPayload>({
		token,
		predicate: matchesUsageAlert(match),
		timeoutMs,
	});
	expect(
		result,
		`expected usage alert webhook for ${match.customerId} @ ${match.threshold}`,
	).not.toBeNull();
	return result!.payload.data;
};

export const expectNoUsageAlert = async ({
	token,
	timeoutMs = 8000,
	...match
}: UsageAlertMatch & { token: string; timeoutMs?: number }) => {
	const result = await waitForWebhook<UsageAlertWebhookPayload>({
		token,
		predicate: matchesUsageAlert(match),
		timeoutMs,
	});
	expect(
		result,
		`expected NO usage alert webhook for ${match.customerId} @ ${match.threshold}`,
	).toBeNull();
};

export const countUsageAlertWebhooks = async ({
	token,
	...match
}: UsageAlertMatch & { token: string }) => {
	const matches = matchesUsageAlert(match);
	const history = await getPlayHistory({ token });
	let count = 0;
	for (const event of history.data) {
		try {
			if (matches(parseEventBody<UsageAlertWebhookPayload>(event))) count++;
		} catch {}
	}
	return count;
};

export const waitForNextMinuteBucket = async () => {
	const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
	await new Promise((resolve) => setTimeout(resolve, msUntilNextMinute + 1000));
};
