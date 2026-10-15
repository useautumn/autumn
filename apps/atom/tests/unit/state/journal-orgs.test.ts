import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type FinalizeCommand,
	parseTrackCommand,
	type TrackCommand,
} from "@autumn/balance-engine";
import type { AtomTracksAppendRequest } from "@autumn/byoc";
import { createJournalForwarder } from "../../../src/journalForwarder/createJournalForwarder.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";
import { noFolderPulls } from "../utils/atomFixtures.js";
import { owedCommand } from "../utils/journalFixtures.js";

const folders: string[] = [];
const journals: Journal[] = [];
const stops: (() => void)[] = [];
const journalPath = () => {
	const folder = mkdtempSync(join(tmpdir(), "atom-journal-orgs-"));
	folders.push(folder);
	return join(folder, "journal-000-of-001.sqlite");
};
const open = (databasePath: string) => {
	const journal = openJournal({ databasePath });
	journals.push(journal);
	return journal;
};
const close = (journal: Journal) => {
	journal.close();
	journals.splice(journals.indexOf(journal), 1);
};
afterEach(() => {
	for (const stop of stops.splice(0)) stop();
	for (const journal of journals.splice(0)) journal.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

const commandOf = ({
	commandId,
	customerId,
	org,
}: {
	commandId: string;
	customerId: string;
	org?: TrackCommand["org"];
}): TrackCommand => {
	const command = owedCommand({ commandId, value: 1, customerId });
	return org ? { ...command, org } : command;
};

const otherOrgOf = (command: TrackCommand): TrackCommand["org"] => ({
	...command.org,
	config: {
		...command.org.config,
		include_past_due: !command.org.config.include_past_due,
	},
});

const rowsIn = (databasePath: string) => {
	const database = new Database(databasePath, { readonly: true });
	try {
		return {
			commands: database
				.query<{ commandJson: string }, []>(
					"SELECT command_json AS commandJson FROM journal_entries ORDER BY customer_id, seq",
				)
				.all()
				.map(({ commandJson }) => JSON.parse(commandJson)),
			orgs: database
				.query<{ n: number }, []>("SELECT count(*) AS n FROM journal_orgs")
				.get()?.n,
		};
	} finally {
		database.close();
	}
};

/** What a forwarder hands Autumn from `journal`, as the request body's tracks. */
const handedIn = async (journal: Journal) => {
	const requests: AtomTracksAppendRequest[] = [];
	const forwarding = createJournalForwarder({
		ctx: {
			autumnClient: {
				appendTracks: async ({ tokenHash: _, ...request }) => {
					requests.push(request);
				},
			},
			logger: { info() {}, warn() {} },
		},
	}).forward({ journal, tokenHash: () => "hash_folder", pulls: noFolderPulls });
	stops.push(() => forwarding.stop());
	for (let wait = 0; wait < 100 && journal.countUnsent() > 0; wait++)
		await Bun.sleep(10);
	return requests.flatMap(({ tracks }) =>
		tracks.flatMap((track) => ("command" in track ? [track.command] : [])),
	);
};

describe("journal orgs", () => {
	test("a row holds its command without the org, each org once, and a reopened file reads every command back with its org byte for byte", async () => {
		const databasePath = journalPath();
		const first = commandOf({ commandId: "a1", customerId: "cus_a" });
		const commands = [
			first,
			commandOf({ commandId: "a2", customerId: "cus_a" }),
			commandOf({
				commandId: "b1",
				customerId: "cus_b",
				org: otherOrgOf(first),
			}),
		];
		const writer = open(databasePath);
		for (const command of commands)
			await writer.append({ customerId: command.identity.customerId, command });
		close(writer);

		const rows = rowsIn(databasePath);
		expect(rows.commands.some((command) => "org" in command)).toBe(false);
		expect(rows.orgs).toBe(2);

		const reopened = open(databasePath);
		const readBack = [
			...reopened.owed({ customerId: "cus_a" }),
			...reopened.owed({ customerId: "cus_b" }),
		].map(({ command }) => command);
		expect(readBack).toEqual(commands);
		expect(readBack.map(({ org }) => JSON.stringify(org))).toEqual(
			commands.map(({ org }) => JSON.stringify(org)),
		);

		await reopened.append({
			customerId: "cus_b",
			command: commandOf({
				commandId: "b2",
				customerId: "cus_b",
				org: otherOrgOf(first),
			}),
		});
		expect(rowsIn(databasePath).orgs).toBe(2);
	});

	test("a file an earlier build wrote, its org inline in the row, opens and hands its commands in unchanged", async () => {
		const databasePath = journalPath();
		close(open(databasePath));
		const command = commandOf({ commandId: "old", customerId: "cus_old" });
		const database = new Database(databasePath, { strict: true });
		database
			.query(
				"INSERT INTO journal_entries (customer_id, seq, appended_at, command_json) VALUES ($customerId, 1, 1700, $commandJson)",
			)
			.run({ customerId: "cus_old", commandJson: JSON.stringify(command) });
		database
			.query(
				"INSERT INTO journal_seqs (customer_id, last_seq) VALUES ($customerId, 1)",
			)
			.run({ customerId: "cus_old" });
		database.close();

		const reopened = open(databasePath);

		expect(
			reopened.owed({ customerId: "cus_old" }).map((entry) => entry.command),
		).toEqual([command]);
		expect(await handedIn(reopened)).toEqual([command]);
	});

	test("a finalize, its org beside its lock, is rebuilt on open with that org as a track is", async () => {
		const databasePath = journalPath();
		const track = commandOf({ commandId: "d1", customerId: "cus_d" });
		const finalize = {
			...commandOf({
				commandId: "d2",
				customerId: "cus_d",
				org: otherOrgOf(track),
			}),
			type: "finalize",
		} as unknown as FinalizeCommand;
		const writer = open(databasePath);
		await writer.append({ customerId: "cus_d", command: track });
		await writer.append({ customerId: "cus_d", command: finalize });
		close(writer);

		expect(
			rowsIn(databasePath).commands.some((command) => "org" in command),
		).toBe(false);
		expect(
			open(databasePath)
				.owed({ customerId: "cus_d" })
				.map(({ command }) => command),
		).toEqual([track, finalize]);
	});

	test("after a restart, the forwarder hands in the same commands it would have before it", async () => {
		const databasePath = journalPath();
		const commands = [
			commandOf({ commandId: "c1", customerId: "cus_c" }),
			commandOf({ commandId: "c2", customerId: "cus_c" }),
		];
		const writer = open(databasePath);
		for (const command of commands)
			await writer.append({ customerId: "cus_c", command });
		close(writer);

		expect(await handedIn(open(databasePath))).toEqual(commands);
	});

	test("rollback: a build from before journal_orgs reads this build's row without its org, so Autumn refuses its hand-in until a build with journal_orgs reopens the file", async () => {
		const databasePath = journalPath();
		const command = commandOf({ commandId: "r1", customerId: "cus_r" });
		const writer = open(databasePath);
		await writer.append({ customerId: "cus_r", command });
		close(writer);

		const [readByEarlierBuild] = rowsIn(databasePath).commands;
		expect(() => parseTrackCommand({ input: readByEarlierBuild })).toThrow();
		expect(
			open(databasePath)
				.owed({ customerId: "cus_r" })
				.map((entry) => entry.command),
		).toEqual([command]);
	});
});
