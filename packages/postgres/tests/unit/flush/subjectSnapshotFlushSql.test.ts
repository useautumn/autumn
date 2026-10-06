import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { commitFlush } from "../../../src/flush/repos/commitFlush.js";
import { flushSql } from "../../../src/flush/repos/flushSql.js";
import type { FlushRequest } from "../../../src/flush/types/flush.js";
import type { SubjectSnapshotUpsert } from "../../../src/subjects/types/subjectSnapshot.js";

const dialect = new PgDialect();
const flatten = (sql: string) => sql.replace(/\s+/g, " ").trim();

const bookmark = {
	topic: "metering",
	partition: 3,
	expectedOffset: 40n,
	nextOffset: 41n,
};

const upsert = (
	overrides: Partial<SubjectSnapshotUpsert> = {},
): SubjectSnapshotUpsert => ({
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
	internalCustomerId: "cus_internal_1",
	internalEntityId: null,
	partition: 3,
	partitionCount: 64,
	stateVersion: 1,
	stateJson: '{"revision":4}',
	baselineAt: 1_700_000_000_000,
	logOffset: 40n,
	...overrides,
});

/** The deleted subjects come back as one JSON array, so the lane knows which rows to rebuild. */
const DELETED_SUBJECTS = `(SELECT coalesce(json_agg(json_build_object('org_id', org_id, 'env', env, 'customer_id', customer_id, 'entity_id', entity_id)), '[]'::json) FROM snapshot_deletes) AS snapshot_deletes`;

describe("flushSql subject snapshots", () => {
	test("no snapshot writes leave the statement exactly as it was", () => {
		const without = dialect.sqlToQuery(
			flushSql({ changes: [], bookmarks: [bookmark] }),
		);
		const empty = dialect.sqlToQuery(
			flushSql({
				changes: [],
				bookmarks: [bookmark],
				snapshots: { upserts: [], deletes: [] },
			}),
		);
		expect(empty).toEqual(without);
		expect(flatten(without.sql)).not.toContain("subject_snapshots");
	});

	test("upserts and deletes are one CTE each, bound as one JSON document apiece, and counted beside the bookmarks", () => {
		const query = dialect.sqlToQuery(
			flushSql({
				changes: [],
				bookmarks: [bookmark],
				snapshots: {
					upserts: [
						upsert(),
						upsert({
							entityId: "ent_1",
							internalEntityId: "ent_internal_1",
							logOffset: null,
						}),
					],
					deletes: [{ orgId: "org_1", env: "live", customerId: "cus_9" }],
				},
			}),
		);
		const sql = flatten(query.sql);
		expect(sql).toContain(
			'snapshot_deletes AS ( DELETE FROM subject_snapshots s USING jsonb_to_recordset($9::text::jsonb) AS d(org_id text, env text, customer_id text) WHERE s.org_id = d.org_id COLLATE "C" AND s.env = d.env COLLATE "C" AND s.customer_id = d.customer_id COLLATE "C" RETURNING s.org_id, s.env, s.customer_id, s.entity_id )',
		);
		expect(sql).toContain(
			"snapshot_upserts AS ( INSERT INTO subject_snapshots AS s",
		);
		expect(sql).toContain(
			"ON CONFLICT (org_id, env, customer_id, entity_id) DO UPDATE SET",
		);
		// A row from an older log never replaces a newer one; a row of unknown lineage, either way, is replaced.
		// A stale row always lands: it keeps the state it has, hides it, and only moves its offset forward.
		expect(sql).toContain(
			"state = CASE WHEN EXCLUDED.written_at = 0 THEN s.state ELSE EXCLUDED.state END",
		);
		expect(sql).toContain(
			"log_offset = CASE WHEN EXCLUDED.written_at = 0 THEN GREATEST(s.log_offset, EXCLUDED.log_offset) ELSE EXCLUDED.log_offset END WHERE EXCLUDED.written_at = 0 OR s.log_offset IS NULL OR EXCLUDED.log_offset IS NULL OR EXCLUDED.log_offset >= s.log_offset OR s.partition <> EXCLUDED.partition OR s.partition_count <> EXCLUDED.partition_count RETURNING 1",
		);
		// A row whose customer or entity is gone is skipped, never an FK error that fails the flush.
		expect(sql).toContain(
			"WHERE EXISTS (SELECT 1 FROM customers c WHERE c.internal_id = v.internal_customer_id) AND (v.internal_entity_id IS NULL OR EXISTS (SELECT 1 FROM entities e WHERE e.internal_id = v.internal_entity_id))",
		);
		expect(sql).toEndWith(
			`(SELECT count(*) FROM b) AS bookmarks, (SELECT count(*) FROM snapshot_upserts) AS snapshot_upserts, ${DELETED_SUBJECTS}`,
		);
		const [deletes, upserts] = query.params.slice(-2) as [string, string];
		expect(JSON.parse(deletes)).toEqual([
			{ org_id: "org_1", env: "live", customer_id: "cus_9" },
		]);
		expect(JSON.parse(upserts)).toEqual([
			{
				org_id: "org_1",
				env: "sandbox",
				customer_id: "cus_1",
				entity_id: "",
				internal_customer_id: "cus_internal_1",
				internal_entity_id: null,
				partition: 3,
				partition_count: 64,
				state_version: 1,
				state: { revision: 4 },
				baseline_at: 1_700_000_000_000,
				log_offset: "40",
				stale: false,
			},
			{
				org_id: "org_1",
				env: "sandbox",
				customer_id: "cus_1",
				entity_id: "ent_1",
				internal_customer_id: "cus_internal_1",
				internal_entity_id: "ent_internal_1",
				partition: 3,
				partition_count: 64,
				state_version: 1,
				state: { revision: 4 },
				baseline_at: 1_700_000_000_000,
				log_offset: null,
				stale: false,
			},
		]);
	});

	test("a flush of snapshot deletes alone moves no bookmark", () => {
		const sql = flatten(
			dialect.sqlToQuery(
				flushSql({
					changes: [],
					bookmarks: [],
					snapshots: {
						upserts: [],
						deletes: [{ orgId: "org_1", env: "live", customerId: "cus_9" }],
					},
				}),
			).sql,
		);
		expect(sql).not.toContain("partition_progress");
		expect(sql).toEndWith(
			`SELECT '[]'::json AS applied, 0 AS bookmarks, 0 AS snapshot_upserts, ${DELETED_SUBJECTS}`,
		);
	});
});

/** A transaction stand-in that answers the flush statement with the given row. */
const fakeDb = ({ row }: { row: Record<string, unknown> }) => {
	const statements: string[] = [];
	const db = {
		execute: async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
			statements.push(flatten(dialect.sqlToQuery(query).sql));
			// pg answers a multi-statement simple query with one result per statement.
			return [{ rows: [] }, { rows: [row] }];
		},
		$client: {
			connect: () => {
				throw new Error("the single-statement flush opened a transaction");
			},
		},
	} as never;
	return { db, statements };
};

describe("commitFlush subject snapshots", () => {
	test("snapshot deletes with no bookmark still run, and report which subjects they removed", async () => {
		const deleted = (entityId: string) => ({
			org_id: "org_1",
			env: "live",
			customer_id: "cus_9",
			entity_id: entityId,
		});
		const { db, statements } = fakeDb({
			row: {
				applied: [],
				bookmarks: 0,
				snapshot_upserts: 0,
				snapshot_deletes: [deleted(""), deleted("en_1"), deleted("en_2")],
			},
		});
		const request: FlushRequest = {
			changes: [],
			bookmarks: [],
			snapshots: {
				upserts: [],
				deletes: [{ orgId: "org_1", env: "live", customerId: "cus_9" }],
			},
		};
		const result = await commitFlush({
			ctx: { db },
			request,
			statementTimeoutMs: 2_000,
			roundTrips: "single",
		});
		expect(statements).toHaveLength(1);
		expect(statements[0]).toContain("snapshot_deletes AS");
		expect(statements[0]).toContain(
			"RETURNING s.org_id, s.env, s.customer_id, s.entity_id",
		);
		const subject = (entityId: string | null) => ({
			orgId: "org_1",
			env: "live",
			customerId: "cus_9",
			entityId,
		});
		expect(result).toEqual({
			applied: [],
			snapshots: {
				upserted: 0,
				deleted: [subject(null), subject("en_1"), subject("en_2")],
			},
		});
	});

	test("a flush without snapshot writes reports none and still skips Postgres when nothing moves", async () => {
		const { db, statements } = fakeDb({ row: {} });
		const result = await commitFlush({
			ctx: { db },
			request: { changes: [], bookmarks: [] },
			statementTimeoutMs: 2_000,
			roundTrips: "single",
		});
		expect(statements).toEqual([]);
		expect(result).toEqual({ applied: [] });
	});
});
