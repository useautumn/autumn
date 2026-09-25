import type { SyncWebhooksParams } from "../../generated/client";
import { SYNCED_LISTS } from "../../generated/emit";

type WebhookParams = SyncWebhooksParams["webhooks"][number];

export type WebhooksForEnv = {
	/** What the sync operations receive: each env-keyed field as this env's value. */
	webhooks: WebhookParams[];
	/** Ids the config states with no value for this env, in config order. */
	skipped: string[];
};

/** The config's webhooks as one environment sees them; a missing key skips the entry. */
export const resolveWebhooksForEnv = ({
	rows,
	envKey,
}: {
	rows: Record<string, unknown>[];
	envKey: string;
}): WebhooksForEnv => {
	const { envKeyed, idField } = SYNCED_LISTS.webhooks;
	const result: WebhooksForEnv = { webhooks: [], skipped: [] };
	for (const row of rows) {
		const values = envKeyed.map(
			(field) => (row[field] as Record<string, unknown> | undefined)?.[envKey],
		);
		if (values.some((value) => typeof value !== "string")) {
			result.skipped.push(String(row[idField]));
			continue;
		}
		result.webhooks.push({
			...row,
			...Object.fromEntries(
				envKeyed.map((field, index) => [field, values[index]]),
			),
		} as WebhookParams);
	}
	return result;
};
