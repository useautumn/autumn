import type { Database } from "bun:sqlite";
import type { JournalEntry } from "../journal/types/journal.js";

type JournalContext = { sqliteDb: Database };

type JournalEntryRow = {
	customerId: string;
	seq: bigint;
	appendedAt: bigint;
	commandJson: string;
};

/** One string for the writer thread: each entry's fields and command JSON, NUL-separated (JSON escapes any NUL it holds). */
export const encodeJournalEntries = ({
	entries,
}: {
	entries: JournalEntry[];
}): string =>
	entries
		.map(
			({ customerId, seq, appendedAt, command }) =>
				`${customerId}\u0000${seq}\u0000${appendedAt}\u0000${JSON.stringify(command)}`,
		)
		.join("\u0000");

/** Every entry or none, with each customer's highest seq raised in the same transaction. */
export const insertJournalEntries = ({
	ctx,
	payload,
}: {
	ctx: JournalContext;
	payload: string;
}): string => {
	const fields = payload.split("\u0000");
	const insertEntry = ctx.sqliteDb.query(
		`INSERT INTO journal_entries (customer_id, seq, appended_at, command_json)
		VALUES ($customerId, $seq, $appendedAt, $commandJson)`,
	);
	const raiseLastSeq = ctx.sqliteDb.query(
		`INSERT INTO journal_seqs (customer_id, last_seq) VALUES ($customerId, $seq)
		ON CONFLICT (customer_id) DO UPDATE SET last_seq = max(last_seq, excluded.last_seq)`,
	);
	ctx.sqliteDb.transaction(() => {
		for (let at = 0; at < fields.length; at += 4) {
			const customerId = fields[at] as string;
			const seq = Number(fields[at + 1]);
			insertEntry.run({
				customerId,
				seq,
				appendedAt: Number(fields[at + 2]),
				commandJson: fields[at + 3] as string,
			});
			raiseLastSeq.run({ customerId, seq });
		}
	})();
	return "";
};

/** Rows were built by this Atom as the worker's commands, so reading only parses JSON. */
export const readOwedJournalEntries = ({
	ctx,
}: {
	ctx: JournalContext;
}): JournalEntry[] =>
	ctx.sqliteDb
		.query<JournalEntryRow, []>(
			`SELECT customer_id AS customerId, seq, appended_at AS appendedAt, command_json AS commandJson
			FROM journal_entries ORDER BY customer_id, seq`,
		)
		.all()
		.map((row) => ({
			customerId: row.customerId,
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
	payload,
}: {
	ctx: JournalContext;
	payload: string;
}): string => {
	const [customerId, seq] = payload.split("\u0000");
	ctx.sqliteDb
		.query(
			"DELETE FROM journal_entries WHERE customer_id = $customerId AND seq <= $seq",
		)
		.run({ customerId: customerId as string, seq: Number(seq) });
	return "";
};

export const deleteCustomerJournalEntries = ({
	ctx,
	payload: customerId,
}: {
	ctx: JournalContext;
	payload: string;
}): string => {
	ctx.sqliteDb
		.query("DELETE FROM journal_entries WHERE customer_id = $customerId")
		.run({ customerId });
	return "";
};
