import type { Message } from "kafkajs";
import type { LedgerEntry } from "../../api/journal/types/ledgerEntry.js";

// Explicit partition (never the key hash) so a shard owns exactly one; the key
// keeps a customer's entries adjacent, and the headers let a consumer route
// without parsing the value.
export const ledgerEntryToKafkaMessage = ({
	entry,
}: {
	entry: LedgerEntry;
}): Message => ({
	partition: entry.shard_id,
	key: `${entry.org_id}:${entry.env}:${entry.customer_id}`,
	headers: {
		kind: entry.kind,
		schema_version: String(entry.schema_version),
		version: String(entry.version),
	},
	value: JSON.stringify(entry),
});
