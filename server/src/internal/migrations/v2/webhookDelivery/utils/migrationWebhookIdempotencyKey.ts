import { hashJson } from "@/utils/hash/hashJson.js";
import type { MigrationWebhookRecord } from "../types/migrationWebhookRecord.js";

/** Same migration, event and change content → same key, so a republish of an
 * already-sent record is deduplicated by Svix (12h window). */
export const migrationWebhookIdempotencyKey = ({
	migrationInternalId,
	eventType,
	record,
	customerProductId,
}: {
	migrationInternalId: string | undefined;
	eventType: string;
	record: MigrationWebhookRecord;
	customerProductId?: string;
}): string | undefined =>
	migrationInternalId
		? `migration:${migrationInternalId}:${eventType}:${hashJson({
				value: { record, customerProductId },
			})}`
		: undefined;
