import type { Database } from "bun:sqlite";
import { callerKeyOf } from "@autumn/balance-engine";
import type { JournalEntry } from "../journal/types/journal.js";
import { insertJournalKey } from "./journalKeys.js";

type JournalContext = { sqliteDb: Database };

type JournalEntryRow = {
	customerId: string;
	writerId: string;
	seq: bigint;
	appendedAt: bigint;
	commandJson: string;
};

const FIELDS_PER_ENTRY = 6;

/** One string for the writer thread: each entry's fields, command JSON and caller key ("" for none), NUL-separated. */
export const encodeJournalEntries = ({
	entries,
}: {
	entries: JournalEntry[];
}): string =>
	entries
		.map(
			({ customerId, writerId, seq, appendedAt, command }) =>
				`${customerId}\u0000${writerId}\u0000${seq}\u0000${appendedAt}\u0000${JSON.stringify(command)}\u0000${(command.type === "track" && callerKeyOf({ command })) || ""}`,
		)
		.join("\u0000");

/**
 * Every entry or none, each caller's key taken in the same transaction. An entry this file minted raises its customer's
 * highest seq too; one held under another writer keeps that writer's seq and raises nothing here.
 */
export const insertJournalEntries = ({
	ctx,
	payload,
}: {
	ctx: JournalContext;
	payload: string;
}): string => {
	const fields = payload.split("\u0000");
	const ownWriterId = readJournalWriterId({ ctx });
	const insertEntry = ctx.sqliteDb.query(
		`INSERT INTO journal_entries (customer_id, writer_id, seq, appended_at, command_json)
		VALUES ($customerId, $writerId, $seq, $appendedAt, $commandJson)`,
	);
	const raiseLastSeq = ctx.sqliteDb.query(
		`INSERT INTO journal_seqs (customer_id, last_seq) VALUES ($customerId, $seq)
		ON CONFLICT (customer_id) DO UPDATE SET last_seq = max(last_seq, excluded.last_seq)`,
	);
	ctx.sqliteDb.transaction(() => {
		for (let at = 0; at < fields.length; at += FIELDS_PER_ENTRY) {
			const customerId = fields[at] as string;
			const writerId = fields[at + 1] as string;
			const seq = Number(fields[at + 2]);
			const appendedAt = Number(fields[at + 3]);
			insertEntry.run({
				customerId,
				writerId,
				seq,
				appendedAt,
				commandJson: fields[at + 4] as string,
			});
			if (writerId === ownWriterId) raiseLastSeq.run({ customerId, seq });
			const key = fields[at + 5];
			if (key) insertJournalKey({ ctx, customerId, key, appendedAt });
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
	payload,
}: {
	ctx: JournalContext;
	payload: string;
}): string => {
	const [customerId, writerId, seq] = payload.split("\u0000");
	ctx.sqliteDb
		.query(
			"DELETE FROM journal_entries WHERE customer_id = $customerId AND writer_id = $writerId AND seq <= $seq",
		)
		.run({
			customerId: customerId as string,
			writerId: writerId as string,
			seq: Number(seq),
		});
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
