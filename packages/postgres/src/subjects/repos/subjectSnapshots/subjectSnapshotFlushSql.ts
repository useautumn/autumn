import { type SQL, sql } from "drizzle-orm";
import type {
	SubjectSnapshotCustomer,
	SubjectSnapshotUpsert,
	SubjectSnapshotWrites,
} from "../../types/subjectSnapshot.js";

/** Bound as text first: Bun's driver would JSON-encode a string aimed straight at jsonb, handing Postgres a quoted document. */
const jsonbRecordsOf = ({ document }: { document: string }): SQL =>
	sql`${document}::text::jsonb`;

/** COLLATE "C" on the probe side so the PK, which is "C", serves the join. */
const snapshotDeletesCte = ({
	deletes,
}: {
	deletes: readonly SubjectSnapshotCustomer[];
}): SQL => {
	const document = JSON.stringify(
		deletes.map((customer) => ({
			org_id: customer.orgId,
			env: customer.env,
			customer_id: customer.customerId,
		})),
	);
	return sql`snapshot_deletes AS (
			DELETE FROM subject_snapshots s
			USING jsonb_to_recordset(${jsonbRecordsOf({ document })}) AS d(org_id text, env text, customer_id text)
			WHERE s.org_id = d.org_id COLLATE "C"
				AND s.env = d.env COLLATE "C"
				AND s.customer_id = d.customer_id COLLATE "C"
			RETURNING 1
		)`;
};

/** Built by hand so each state, already a JSON string, is spliced in rather than encoded a second time. */
const upsertsDocumentOf = ({
	upserts,
}: {
	upserts: readonly SubjectSnapshotUpsert[];
}): string => {
	const rows = upserts.map((row) => {
		const { stateJson, ...columns } = row;
		const head = JSON.stringify({
			org_id: columns.orgId,
			env: columns.env,
			customer_id: columns.customerId,
			entity_id: columns.entityId ?? "",
			internal_customer_id: columns.internalCustomerId,
			internal_entity_id: columns.internalEntityId,
			partition: columns.partition,
			partition_count: columns.partitionCount,
			state_version: columns.stateVersion,
			baseline_at: columns.baselineAt,
			log_offset: columns.logOffset === null ? null : String(columns.logOffset),
		});
		return `${head.slice(0, -1)},"state":${stateJson}}`;
	});
	return `[${rows.join(",")}]`;
};

/** A row whose customer or entity is already gone is skipped: an FK error would fail every row of the flush. */
const snapshotUpsertsCte = ({
	upserts,
}: {
	upserts: readonly SubjectSnapshotUpsert[];
}): SQL => {
	const document = upsertsDocumentOf({ upserts });
	return sql`snapshot_upserts AS (
			INSERT INTO subject_snapshots AS s (org_id, env, customer_id, entity_id, internal_customer_id, internal_entity_id, partition, partition_count, state_version, state, baseline_at, written_at, log_offset)
			SELECT v.org_id, v.env, v.customer_id, v.entity_id, v.internal_customer_id, v.internal_entity_id, v.partition, v.partition_count, v.state_version, v.state, v.baseline_at, ROUND(date_part('epoch', now()) * 1000)::bigint, v.log_offset
			FROM jsonb_to_recordset(${jsonbRecordsOf({ document })}) AS v(org_id text, env text, customer_id text, entity_id text, internal_customer_id text, internal_entity_id text, partition integer, partition_count integer, state_version integer, state jsonb, baseline_at bigint, log_offset bigint)
			WHERE EXISTS (SELECT 1 FROM customers c WHERE c.internal_id = v.internal_customer_id)
				AND (v.internal_entity_id IS NULL OR EXISTS (SELECT 1 FROM entities e WHERE e.internal_id = v.internal_entity_id))
			ON CONFLICT (org_id, env, customer_id, entity_id) DO UPDATE SET
				internal_customer_id = EXCLUDED.internal_customer_id,
				internal_entity_id = EXCLUDED.internal_entity_id,
				partition = EXCLUDED.partition,
				partition_count = EXCLUDED.partition_count,
				state_version = EXCLUDED.state_version,
				state = EXCLUDED.state,
				baseline_at = EXCLUDED.baseline_at,
				written_at = EXCLUDED.written_at,
				log_offset = EXCLUDED.log_offset
			RETURNING 1
		)`;
};

/** The flush's snapshot CTEs and their counts, so a customer's rows are replaced or removed in the same statement as its bookmark. */
export const subjectSnapshotFlushSql = ({
	snapshots,
}: {
	snapshots: SubjectSnapshotWrites;
}): { ctes: SQL[]; upserted: SQL; deleted: SQL } => {
	const hasDeletes = snapshots.deletes.length > 0;
	const hasUpserts = snapshots.upserts.length > 0;

	const ctes: SQL[] = [];
	if (hasDeletes) ctes.push(snapshotDeletesCte({ deletes: snapshots.deletes }));
	if (hasUpserts) ctes.push(snapshotUpsertsCte({ upserts: snapshots.upserts }));

	return {
		ctes,
		upserted: hasUpserts
			? sql`(SELECT count(*) FROM snapshot_upserts)`
			: sql`0`,
		deleted: hasDeletes ? sql`(SELECT count(*) FROM snapshot_deletes)` : sql`0`,
	};
};
