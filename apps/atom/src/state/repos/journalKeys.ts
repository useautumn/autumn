import type { Database } from "bun:sqlite";

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
