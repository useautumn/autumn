import type { Database } from "bun:sqlite";
import type { JournalEntry } from "../journal/types/journal.js";

type JournalContext = { sqliteDb: Database };

type JournalEntryRow = {
	customerId: string;
	writerId: string;
	seq: bigint;
	appendedAt: bigint;
	commandJson: string;
};

/**
 * Every entry or none. An entry this file minted raises its customer's highest seq in the same transaction; one handed
 * over from another writer keeps that writer's seq and raises nothing here.
 */
export const insertJournalEntries = ({
	ctx,
	entries,
	minted,
}: {
	ctx: JournalContext;
	entries: JournalEntry[];
	minted: boolean;
}): void => {
	const insertEntry = ctx.sqliteDb.query(
		`INSERT INTO journal_entries (customer_id, writer_id, seq, appended_at, command_json)
		VALUES ($customerId, $writerId, $seq, $appendedAt, $commandJson)`,
	);
	const raiseLastSeq = ctx.sqliteDb.query(
		`INSERT INTO journal_seqs (customer_id, last_seq) VALUES ($customerId, $seq)
		ON CONFLICT (customer_id) DO UPDATE SET last_seq = max(last_seq, excluded.last_seq)`,
	);
	ctx.sqliteDb.transaction(() => {
		for (const { customerId, writerId, seq, appendedAt, command } of entries) {
			insertEntry.run({
				customerId,
				writerId,
				seq,
				appendedAt,
				commandJson: JSON.stringify(command),
			});
			if (minted) raiseLastSeq.run({ customerId, seq });
		}
	})();
};

/** Rows were built by this Atom as the worker's commands, so reading only parses JSON. */
export const readOwedJournalEntries = ({
	ctx,
}: {
	ctx: JournalContext;
}): JournalEntry[] =>
	ctx.sqliteDb
		.query<JournalEntryRow, []>(
			`SELECT customer_id AS customerId, writer_id AS writerId, seq, appended_at AS appendedAt, command_json AS commandJson
			FROM journal_entries ORDER BY customer_id, appended_at, seq`,
		)
		.all()
		.map((row) => ({
			customerId: row.customerId,
			writerId: row.writerId,
			seq: Number(row.seq),
			appendedAt: Number(row.appendedAt),
			command: JSON.parse(row.commandJson),
		}));

export const readLastJournalSeqs = ({
	ctx,
}: {
	ctx: JournalContext;
}): Map<string, number> =>
	new Map(
		ctx.sqliteDb
			.query<{ customerId: string; lastSeq: bigint }, []>(
				"SELECT customer_id AS customerId, last_seq AS lastSeq FROM journal_seqs",
			)
			.all()
			.map(({ customerId, lastSeq }) => [customerId, Number(lastSeq)]),
	);

export const readJournalWriterId = ({
	ctx,
}: {
	ctx: JournalContext;
}): string => {
	const row = ctx.sqliteDb
		.query<{ writerId: string }, []>(
			"SELECT writer_id AS writerId FROM journal_meta WHERE id = 1",
		)
		.get();
	if (!row) throw new Error("A journal file holds no writer id");
	return row.writerId;
};

export const deleteJournalEntriesUpTo = ({
	ctx,
	customerId,
	writerId,
	seq,
}: {
	ctx: JournalContext;
	customerId: string;
	writerId: string;
	seq: number;
}): void => {
	ctx.sqliteDb
		.query(
			"DELETE FROM journal_entries WHERE customer_id = $customerId AND writer_id = $writerId AND seq <= $seq",
		)
		.run({ customerId, writerId, seq });
};

/** The rows named, by their writer and seq: what a handoff moved to another journal. */
export const deleteJournalEntries = ({
	ctx,
	entries,
}: {
	ctx: JournalContext;
	entries: JournalEntry[];
}): void => {
	const deleteEntry = ctx.sqliteDb.query(
		"DELETE FROM journal_entries WHERE customer_id = $customerId AND writer_id = $writerId AND seq = $seq",
	);
	ctx.sqliteDb.transaction(() => {
		for (const { customerId, writerId, seq } of entries)
			deleteEntry.run({ customerId, writerId, seq });
	})();
};

export const deleteCustomerJournalEntries = ({
	ctx,
	customerId,
}: {
	ctx: JournalContext;
	customerId: string;
}): void => {
	ctx.sqliteDb
		.query("DELETE FROM journal_entries WHERE customer_id = $customerId")
		.run({ customerId });
};
