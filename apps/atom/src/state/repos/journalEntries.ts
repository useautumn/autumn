import type { Database } from "bun:sqlite";
import { callerKeyOf } from "../journal/callerKeyOf.js";
import type { JournalEntry } from "../journal/types/journal.js";
import { insertJournalKey } from "./journalKeys.js";

type JournalContext = { sqliteDb: Database };

type JournalEntryRow = {
	customerId: string;
	seq: bigint;
	appendedAt: bigint;
	commandJson: string;
};

const FIELDS_PER_ENTRY = 6;

type CommandOrg = JournalEntry["command"]["org"];

/** 64-bit xxHash of the org's JSON: one row per distinct org in a file, so a collision would need two orgs in one file. */
const orgHashOf = (orgJson: string): string =>
	Bun.hash.xxHash64(orgJson).toString(16);

/** Orgs are shared objects (one per tenant), so each is serialized and hashed once, not once per append. */
const encodedOrgs = new WeakMap<CommandOrg, { hash: string; json: string }>();

export const encodedOrgOf = (
	org: CommandOrg,
): { hash: string; json: string } => {
	const held = encodedOrgs.get(org);
	if (held) return held;
	const json = JSON.stringify(org);
	const encoded = { hash: orgHashOf(json), json };
	encodedOrgs.set(org, encoded);
	return encoded;
};

/**
 * One string for the writer thread: each entry's fields, its command JSON with the org replaced by its hash, its caller key
 * ("" for none), and the org's JSON when the file does not hold it yet ("" otherwise), NUL-separated.
 */
export const encodeJournalEntries = ({
	entries,
	storedOrgs,
}: {
	entries: JournalEntry[];
	storedOrgs: ReadonlySet<string>;
}): string => {
	const sent = new Set<string>();
	return entries
		.map(({ customerId, seq, appendedAt, command }) => {
			const org = encodedOrgOf(command.org);
			const orgJson =
				storedOrgs.has(org.hash) || sent.has(org.hash) ? "" : org.json;
			sent.add(org.hash);
			const commandJson = JSON.stringify({
				...command,
				org: undefined,
				orgHash: org.hash,
			});
			return `${customerId}\u0000${seq}\u0000${appendedAt}\u0000${commandJson}\u0000${callerKeyOf({ command }) ?? ""}\u0000${orgJson}`;
		})
		.join("\u0000");
};

/** Every entry or none, with each customer's highest seq raised and its caller key taken in the same transaction. */
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
	const storeOrg = ctx.sqliteDb.query(
		"INSERT OR IGNORE INTO journal_orgs (org_hash, org_json) VALUES ($orgHash, $orgJson)",
	);
	const raiseLastSeq = ctx.sqliteDb.query(
		`INSERT INTO journal_seqs (customer_id, last_seq) VALUES ($customerId, $seq)
		ON CONFLICT (customer_id) DO UPDATE SET last_seq = max(last_seq, excluded.last_seq)`,
	);
	ctx.sqliteDb.transaction(() => {
		for (let at = 0; at < fields.length; at += FIELDS_PER_ENTRY) {
			const customerId = fields[at] as string;
			const seq = Number(fields[at + 1]);
			const appendedAt = Number(fields[at + 2]);
			insertEntry.run({
				customerId,
				seq,
				appendedAt,
				commandJson: fields[at + 3] as string,
			});
			raiseLastSeq.run({ customerId, seq });
			const key = fields[at + 4];
			if (key) insertJournalKey({ ctx, customerId, key, appendedAt });
			const orgJson = fields[at + 5];
			if (orgJson) storeOrg.run({ orgHash: orgHashOf(orgJson), orgJson });
		}
	})();
	return "";
};

/** The orgs a file holds, by hash: what its rows' commands are read back with. */
export const readJournalOrgs = ({
	ctx,
}: {
	ctx: JournalContext;
}): Map<string, string> =>
	new Map(
		ctx.sqliteDb
			.query<{ orgHash: string; orgJson: string }, []>(
				"SELECT org_hash AS orgHash, org_json AS orgJson FROM journal_orgs",
			)
			.all()
			.map(({ orgHash, orgJson }) => [orgHash, orgJson]),
	);

/** A row of an earlier build carries its org inline; one of this build carries the hash of a journal_orgs row. */
const commandOf = ({
	commandJson,
	orgs,
}: {
	commandJson: string;
	orgs: Map<string, string>;
}): JournalEntry["command"] => {
	const { orgHash, ...command } = JSON.parse(commandJson);
	if (orgHash === undefined) return command;
	const orgJson = orgs.get(orgHash);
	if (orgJson === undefined)
		throw new Error(
			`A journal row names org ${orgHash}, which its file does not hold`,
		);
	return { ...command, org: JSON.parse(orgJson) };
};

/** Rows were built by this Atom as the worker's commands, so reading only parses JSON. */
export const readOwedJournalEntries = ({
	ctx,
}: {
	ctx: JournalContext;
}): JournalEntry[] => {
	const orgs = readJournalOrgs({ ctx });
	return ctx.sqliteDb
		.query<JournalEntryRow, []>(
			`SELECT customer_id AS customerId, seq, appended_at AS appendedAt, command_json AS commandJson
			FROM journal_entries ORDER BY customer_id, seq`,
		)
		.all()
		.map((row) => ({
			customerId: row.customerId,
			seq: Number(row.seq),
			appendedAt: Number(row.appendedAt),
			command: commandOf({ commandJson: row.commandJson, orgs }),
		}));
};

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
	ctx.sqliteDb.transaction(() => {
		ctx.sqliteDb
			.query("DELETE FROM journal_entries WHERE customer_id = $customerId")
			.run({ customerId });
		ctx.sqliteDb
			.query("DELETE FROM journal_keys WHERE customer_id = $customerId")
			.run({ customerId });
	})();
	return "";
};
