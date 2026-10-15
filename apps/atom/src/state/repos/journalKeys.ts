import type { Database } from "bun:sqlite";
import type { JournalKeyRow } from "../journal/types/journal.js";

type JournalContext = { sqliteDb: Database };

/** Rows deleted per statement, so one prune never holds the thread for long (about 15 ms per 1,000). */
export const PRUNE_CHUNK = 1_000;

/** 16 bytes per key. Bun has no xxHash128, so two seeded xxHash3s stand in for it. */
export const journalKeyHash = ({ key }: { key: string }): Uint8Array => {
	const hash = new Uint8Array(16);
	const view = new DataView(hash.buffer);
	view.setBigUint64(0, BigInt.asUintN(64, BigInt(Bun.hash.xxHash3(key, 0n))));
	view.setBigUint64(8, BigInt.asUintN(64, BigInt(Bun.hash.xxHash3(key, 1n))));
	return hash;
};

/** Additive, so the schema version stays: an older build ignores the table, and a file from one gains it on open. */
export const createJournalKeysTable = ({
	database,
}: {
	database: Database;
}): void => {
	database.run(`
		CREATE TABLE IF NOT EXISTS journal_keys (
			customer_id TEXT NOT NULL,
			key_hash BLOB NOT NULL,
			appended_at INTEGER NOT NULL,
			PRIMARY KEY (customer_id, key_hash)
		) WITHOUT ROWID
	`);
	database.run(
		"CREATE INDEX IF NOT EXISTS journal_keys_age ON journal_keys (appended_at)",
	);
};

/** Inside the entry's transaction. A row past its age that the prune has not reached yet is taken again. */
export const insertJournalKey = ({
	ctx,
	customerId,
	key,
	appendedAt,
}: {
	ctx: JournalContext;
	customerId: string;
	key: string;
	appendedAt: number;
}): void => {
	ctx.sqliteDb
		.query(
			`INSERT INTO journal_keys (customer_id, key_hash, appended_at) VALUES ($customerId, $keyHash, $appendedAt)
			ON CONFLICT (customer_id, key_hash) DO UPDATE SET appended_at = excluded.appended_at`,
		)
		.run({ customerId, keyHash: journalKeyHash({ key }), appendedAt });
};

/** A write: deletes up to PRUNE_CHUNK rows appended before the time in `payload`, and answers how many it deleted. */
export const pruneJournalKeys = ({
	ctx,
	payload,
}: {
	ctx: JournalContext;
	payload: string;
}): string =>
	String(
		ctx.sqliteDb
			.query(
				`DELETE FROM journal_keys WHERE (customer_id, key_hash) IN (
					SELECT customer_id, key_hash FROM journal_keys WHERE appended_at < $appendedBefore LIMIT ${PRUNE_CHUNK}
				)`,
			)
			.run({ appendedBefore: Number(payload) }).changes,
	);

/** A write: the customer in `payload` is forgotten. */
export const deleteCustomerJournalKeys = ({
	ctx,
	payload: customerId,
}: {
	ctx: JournalContext;
	payload: string;
}): string => {
	ctx.sqliteDb
		.query("DELETE FROM journal_keys WHERE customer_id = $customerId")
		.run({ customerId });
	return "";
};

/** Bounded by age as well, so a row the prune has not reached yet is already new. */
export const readJournalKey = ({
	ctx,
	customerId,
	key,
	appendedSince,
}: {
	ctx: JournalContext;
	customerId: string;
	key: string;
	appendedSince: number;
}): boolean =>
	ctx.sqliteDb
		.query<{ held: bigint }, [string, Uint8Array, number]>(
			"SELECT 1 AS held FROM journal_keys WHERE customer_id = ? AND key_hash = ? AND appended_at >= ?",
		)
		.get(customerId, journalKeyHash({ key }), appendedSince) !== null;

/** The row a key is written as, its hash as hex, as it is relayed to the other replicas. */
export const journalKeyRowOf = ({
	customerId,
	key,
	appendedAt,
}: {
	customerId: string;
	key: string;
	appendedAt: number;
}): JournalKeyRow => ({
	customerId,
	keyHash: Buffer.from(journalKeyHash({ key })).toString("hex"),
	appendedAt,
});

/** A write: rows another replica wrote, JSON, in one transaction; a row already held keeps its own. Answers how many were new. */
export const insertRelayedJournalKeys = ({
	ctx,
	payload,
}: {
	ctx: JournalContext;
	payload: string;
}): string => {
	const insert = ctx.sqliteDb.query(
		"INSERT OR IGNORE INTO journal_keys (customer_id, key_hash, appended_at) VALUES ($customerId, $keyHash, $appendedAt)",
	);
	let inserted = 0;
	ctx.sqliteDb.transaction(() => {
		for (const { customerId, keyHash, appendedAt } of JSON.parse(
			payload,
		) as JournalKeyRow[])
			inserted += insert.run({
				customerId,
				keyHash: Buffer.from(keyHash, "hex"),
				appendedAt,
			}).changes;
	})();
	return String(inserted);
};

/** Rows written at or after `appendedSince`, in age-index order, past `after`: a page of what a booting peer copies. */
export const readRecentJournalKeys = ({
	ctx,
	appendedSince,
	after,
	limit,
}: {
	ctx: JournalContext;
	appendedSince: number;
	after: JournalKeyRow | null;
	limit: number;
}): JournalKeyRow[] =>
	ctx.sqliteDb
		.query<
			{ customerId: string; keyHash: Uint8Array; appendedAt: bigint },
			{
				from: number;
				afterAt: number | null;
				afterCustomerId: string | null;
				afterKeyHash: Uint8Array | null;
				limit: number;
			}
		>(
			`SELECT customer_id AS customerId, key_hash AS keyHash, appended_at AS appendedAt FROM journal_keys
			WHERE appended_at >= $from
				AND ($afterAt IS NULL OR (appended_at, customer_id, key_hash) > ($afterAt, $afterCustomerId, $afterKeyHash))
			ORDER BY appended_at, customer_id, key_hash LIMIT $limit`,
		)
		.all({
			// From the cursor's own time, so each page seeks the age index instead of scanning every row before it.
			from: Math.max(appendedSince, after?.appendedAt ?? appendedSince),
			afterAt: after?.appendedAt ?? null,
			afterCustomerId: after?.customerId ?? null,
			afterKeyHash: after ? Buffer.from(after.keyHash, "hex") : null,
			limit,
		})
		.map(({ customerId, keyHash, appendedAt }) => ({
			customerId,
			keyHash: Buffer.from(keyHash).toString("hex"),
			appendedAt: Number(appendedAt),
		}));
