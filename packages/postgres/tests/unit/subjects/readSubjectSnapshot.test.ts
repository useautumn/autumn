import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	readSubjectSnapshot,
	readSubjectSnapshotSql,
} from "../../../src/subjects/repos/subjectSnapshots/readSubjectSnapshot.js";
import { subjectSnapshotStateHex } from "../../../src/subjects/repos/subjectSnapshots/subjectSnapshotState.js";

const dialect = new PgDialect();
const flatten = (sql: string) => sql.replace(/\s+/g, " ").trim();
const ctx = { orgId: "org_1", env: "live" };

describe("readSubjectSnapshot", () => {
	test("one bare statement: the primary key, this build's version and the age the table is trusted from, the customer's own subject as an empty entity id", () => {
		const { sql, params } = dialect.sqlToQuery(
			readSubjectSnapshotSql({
				ctx,
				customerId: "cus_1",
				entityId: null,
				probe: { stateVersion: 1, writtenAfter: 1_700_000_000_000 },
			}),
		);
		const text = flatten(sql);
		expect(text).toBe(
			'SELECT s.state FROM subject_snapshots s WHERE s.org_id = $1 COLLATE "C" AND s.env = $2 COLLATE "C" AND s.customer_id = $3 COLLATE "C" AND s.entity_id = $4 COLLATE "C" AND s.state_version = $5 AND s.written_at > $6',
		);
		expect(params).toEqual([
			"org_1",
			"live",
			"cus_1",
			"",
			1,
			1_700_000_000_000,
		]);
	});

	test("the stored state decompressed when the row exists, else null", async () => {
		let answer: Record<string, unknown>[] = [];
		const db = { execute: async () => ({ rows: answer }) };
		expect(
			await readSubjectSnapshot({
				ctx: { ...ctx, db },
				customerId: "cus_1",
				entityId: "seat_1",
				probe: { stateVersion: 1, writtenAfter: 0 },
			}),
		).toBeNull();
		const hex = subjectSnapshotStateHex({ stateJson: '{"revision":0}' });
		answer = [{ state: Buffer.from(hex.slice(2), "hex") }];
		expect(
			await readSubjectSnapshot({
				ctx: { ...ctx, db },
				customerId: "cus_1",
				entityId: "seat_1",
				probe: { stateVersion: 1, writtenAfter: 0 },
			}),
		).toEqual({ revision: 0 });
	});
});
