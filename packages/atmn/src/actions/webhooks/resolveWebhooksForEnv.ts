import type { SyncWebhooksParams } from "../../generated/client";
import { SYNCED_LISTS } from "../../generated/emit";

type WebhookParams = SyncWebhooksParams["webhooks"][number];

/** The config's webhooks as one environment sees them; a missing key skips the entry. */
export const resolveWebhooksForEnv = ({
	rows,
	envKey,
}: {
	rows: Record<string, unknown>[];
	envKey: string;
}): WebhookParams[] => {
	const { envKeyed } = SYNCED_LISTS.webhooks;
	const webhooks: WebhookParams[] = [];
	for (const row of rows) {
		const values = envKeyed.map(
			(field) => (row[field] as Record<string, unknown> | undefined)?.[envKey],
		);
		if (values.some((value) => typeof value !== "string")) continue;
		webhooks.push({
			...row,
			...Object.fromEntries(
				envKeyed.map((field, index) => [field, values[index]]),
			),
		} as WebhookParams);
	}
	return webhooks;
};
