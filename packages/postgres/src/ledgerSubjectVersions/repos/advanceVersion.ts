import { sql } from "drizzle-orm";
import type { PostgresClient } from "../../createPostgresDb.js";

const FIRST_VERSION = 1;

/** Moves a subject's cursor to `version`, and only from `version - 1`.
 *  False means the write did not happen: the caller reads the stored version
 *  to tell a duplicate from a gap. */
export const advanceVersion = async ({
	db,
	internalCustomerId,
	version,
	partition,
	kafkaOffset,
}: {
	db: PostgresClient;
	internalCustomerId: string;
	version: number;
	partition: number;
	kafkaOffset: number;
}): Promise<boolean> => {
	// Only v1 may create the row: a later version with no predecessor is a gap,
	// so it gets no insert path at all.
	const statement =
		version === FIRST_VERSION
			? sql`
				INSERT INTO ledger_subject_versions
					(internal_customer_id, version, partition, kafka_offset, updated_at)
				VALUES (${internalCustomerId}, ${version}, ${partition}, ${kafkaOffset}, now())
				ON CONFLICT (internal_customer_id) DO UPDATE
					SET version = excluded.version,
						partition = excluded.partition,
						kafka_offset = excluded.kafka_offset,
						updated_at = now()
					WHERE ledger_subject_versions.version = excluded.version - 1
			`
			: sql`
				UPDATE ledger_subject_versions
					SET version = ${version},
						partition = ${partition},
						kafka_offset = ${kafkaOffset},
						updated_at = now()
				WHERE internal_customer_id = ${internalCustomerId}
					AND version = ${version} - 1
			`;

	const result = await db.execute(statement);
	return (result.rowCount ?? 0) > 0;
};
