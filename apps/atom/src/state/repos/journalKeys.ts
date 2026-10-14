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

/** BENCH ONLY (#369 key-log prototype): keys append in time order, so a commit dirties the log's last page, not a random leaf. */
export const createJournalKeysTable = ({
	database,
}: {
	database: Database;
}) => {
	database.run("DROP TABLE IF EXISTS journal_keys");
	database.run(`
		CREATE TABLE IF NOT EXISTS journal_key_log (
			appended_at INTEGER NOT NULL,
			customer_id TEXT NOT NULL,
			key_hash BLOB NOT NULL
		)
	`);
};

/** The keys taken since `since`, oldest first: what a journal holds in memory as it opens. */
export const readJournalKeysSince = ({
	ctx,
	since,
}: {
	ctx: JournalContext;
	since: number;
}): { customerId: string; keyHashLow: bigint; appendedAt: number }[] =>
	ctx.sqliteDb
		.query<
			{ customerId: string; keyHash: Uint8Array; appendedAt: bigint },
			[number]
		>(
			"SELECT customer_id AS customerId, key_hash AS keyHash, appended_at AS appendedAt FROM journal_key_log WHERE appended_at >= ? ORDER BY rowid",
		)
		.all(since)
		.map(({ customerId, keyHash, appendedAt }) => ({
			customerId,
			keyHashLow: new DataView(
				keyHash.buffer,
				keyHash.byteOffset,
				8,
			).getBigUint64(0),
			appendedAt: Number(appendedAt),
		}));

/** Inside the entries' transaction. */
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
			"INSERT INTO journal_key_log (appended_at, customer_id, key_hash) VALUES ($appendedAt, $customerId, $keyHash)",
		)
		.run({ customerId, keyHash: journalKeyHash({ key }), appendedAt });
};

/** One chunk off the log's front, the oldest rows, those older than the cutoff; answers `rows:ms`. */
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
			`DELETE FROM journal_key_log WHERE rowid IN (
				SELECT rowid FROM journal_key_log ORDER BY rowid LIMIT ${PRUNE_CHUNK}
			) AND appended_at < $cutoff`,
		)
		.run({ cutoff: Number(payload) });
	return `${changes}:${performance.now() - startedAt}`;
};
