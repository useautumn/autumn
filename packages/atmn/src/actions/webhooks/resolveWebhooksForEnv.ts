import type { SyncWebhooksParams } from "../../generated/client";
import { SYNCED_LISTS } from "../../generated/emit";

type WebhookParams = SyncWebhooksParams["webhooks"][number];

/** The config's entries for one environment, as the sync body takes them. */
export const resolveWebhooksForEnv = ({
	rows,
	envKey,
}: {
	rows: Record<string, unknown>[];
	envKey: string;
}): WebhookParams[] => {
	const { envField } = SYNCED_LISTS.webhooks;
	return rows
		.filter((row) => row[envField] === envKey)
		.map(({ [envField]: _env, ...row }) => row as WebhookParams);
};
