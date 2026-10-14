import type { Database } from "bun:sqlite";

type JournalContext = { sqliteDb: Database };

/** Rows are deleted in chunks this size, each its own transaction, so a prune never holds the writer long. */
export const PRUNE_CHUNK = 1_000;

/** 16 bytes per key. Bun has no xxHash128, so two seeded xxHash3s stand in for it. */
export const journalKeyHash = ({ key }: { key: string }): Uint8Array => {
	const hash = new Uint8Array(16);
	const view = new DataView(hash.buffer);
	view.setBigUint64(0, BigInt.asUintN(64, BigInt(Bun.hash.xxHash3(key, 0n))));
	view.setBigUint64(8, BigInt.asUintN(64, BigInt(Bun.hash.xxHash3(key, 1n))));
	return hash;
};

/** Additive: an older build ignores the table, and a file from one gains it here, so the schema version stays. */
export const createJournalKeysTable = ({
	database,
}: {
	database: Database;
}) => {
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

/** A row past its age is new again; the prune only reclaims its space. */
export const readJournalKey = ({
	ctx,
	customerId,
	key,
	since,
}: {
	ctx: JournalContext;
	customerId: string;
	key: string;
	since: number;
}): boolean =>
	ctx.sqliteDb
		.query<{ held: bigint }, [string, Uint8Array, number]>(
			"SELECT 1 AS held FROM journal_keys WHERE customer_id = ? AND key_hash = ? AND appended_at >= ?",
		)
		.get(customerId, journalKeyHash({ key }), since) !== null;

/** Inside the entries' transaction; a key past its age (not yet pruned) is taken again. */
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

/** One chunk of rows older than the cutoff in `payload`; answers how many it deleted and the writer's ms, `rows:ms`. */
export const pruneJournalKeys = ({
	ctx,
	payload,
}: {
	ctx: JournalContext;
	payload: string;
}): string => {
	const startedAt = performance.now();
	const { changes } = ctx.sqliteDb
		.query(
			`DELETE FROM journal_keys WHERE (customer_id, key_hash) IN (
				SELECT customer_id, key_hash FROM journal_keys WHERE appended_at < $cutoff LIMIT ${PRUNE_CHUNK}
			)`,
		)
		.run({ cutoff: Number(payload) });
	return `${changes}:${performance.now() - startedAt}`;
};
