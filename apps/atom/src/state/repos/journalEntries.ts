import type { Database } from "bun:sqlite";
import type { JournalEntry, JournalStatus } from "../journal/types/journal.js";

type JournalContext = { sqliteDb: Database };

type JournalEntryRow = {
	customerId: string;
	seq: bigint;
	status: "pending" | "sent";
	commandJson: string;
};

const statusToColumns = (
	status: JournalStatus,
): { status: JournalStatus["kind"]; rejectCode: string | null } => ({
	status: status.kind,
	rejectCode: status.kind === "rejected" ? status.code : null,
});

/** Every entry or none, with each customer's highest seq raised in the same transaction. */
export const insertJournalEntries = ({
	ctx,
	entries,
}: {
	ctx: JournalContext;
	entries: JournalEntry[];
}): void => {
	const insertEntry = ctx.sqliteDb.query(
		`INSERT INTO journal_entries (customer_id, seq, status, reject_code, command_json)
		VALUES ($customerId, $seq, $status, $rejectCode, $commandJson)`,
	);
	const raiseLastSeq = ctx.sqliteDb.query(
		`INSERT INTO journal_seqs (customer_id, last_seq) VALUES ($customerId, $seq)
		ON CONFLICT (customer_id) DO UPDATE SET last_seq = max(last_seq, excluded.last_seq)`,
	);
	ctx.sqliteDb.transaction(() => {
		for (const { customerId, seq, status, command } of entries) {
			insertEntry.run({
				customerId,
				seq,
				...statusToColumns(status),
				commandJson: JSON.stringify(command),
			});
			raiseLastSeq.run({ customerId, seq });
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
			`SELECT customer_id AS customerId, seq, status, command_json AS commandJson
			FROM journal_entries WHERE status != 'rejected' ORDER BY customer_id, seq`,
		)
		.all()
		.map((row) => ({
			customerId: row.customerId,
			seq: Number(row.seq),
			status: { kind: row.status },
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

export const updateJournalStatus = ({
	ctx,
	customerId,
	seq,
	status,
}: {
	ctx: JournalContext;
	customerId: string;
	seq: number;
	status: JournalStatus;
}): void => {
	ctx.sqliteDb
		.query(
			`UPDATE journal_entries SET status = $status, reject_code = $rejectCode
			WHERE customer_id = $customerId AND seq = $seq`,
		)
		.run({ customerId, seq, ...statusToColumns(status) });
};

export const deleteJournalEntries = ({
	ctx,
	customerId,
	seqs,
}: {
	ctx: JournalContext;
	customerId: string;
	seqs: number[];
}): void => {
	const deleteEntry = ctx.sqliteDb.query(
		"DELETE FROM journal_entries WHERE customer_id = $customerId AND seq = $seq",
	);
	ctx.sqliteDb.transaction(() => {
		for (const seq of seqs) deleteEntry.run({ customerId, seq });
	})();
};
