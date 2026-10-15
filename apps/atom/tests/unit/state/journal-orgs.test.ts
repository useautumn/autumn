import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	createState,
	createTrackCommand,
	org,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";

const folders: string[] = [];
const journals: Journal[] = [];
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
afterEach(() => {
	for (const journal of journals.splice(0)) journal.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

const otherOrg: TrackCommand["org"] = { ...org, default_currency: "eur" };

const commandOf = ({
	commandId,
	customerId,
	commandOrg,
}: {
	commandId: string;
	customerId: string;
	commandOrg: TrackCommand["org"];
}): TrackCommand => ({
	...createTrackCommand({ commandId, value: 1, overageBehavior: "overflow" }),
	identity: { ...createState().identity, customerId },
	org: commandOrg,
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

describe("journal orgs", () => {
	test("an entry's row holds its command without the org, each org once, and reads back whole after a reopen", async () => {
		const databasePath = journalPath();
		const commands = [
			commandOf({ commandId: "a1", customerId: "cus_a", commandOrg: org }),
			commandOf({ commandId: "a2", customerId: "cus_a", commandOrg: org }),
			commandOf({ commandId: "b1", customerId: "cus_b", commandOrg: otherOrg }),
		];
		const first = open(databasePath);
		for (const command of commands)
			await first.append({ customerId: command.identity.customerId, command });
		first.close();
		journals.splice(journals.indexOf(first), 1);

		const rows = rowsIn(databasePath);
		expect(rows.commands.every((command) => !("org" in command))).toBe(true);
		expect(rows.orgs).toBe(2);

		const reopened = open(databasePath);
		expect(
			reopened.owed({ customerId: "cus_a" }).map(({ command }) => command),
		).toEqual(commands.slice(0, 2));
		expect(
			reopened.owed({ customerId: "cus_b" }).map(({ command }) => command),
		).toEqual(commands.slice(2));
		await reopened.append({
			customerId: "cus_b",
			command: commandOf({
				commandId: "b2",
				customerId: "cus_b",
				commandOrg: otherOrg,
			}),
		});
		expect(rowsIn(databasePath).orgs).toBe(2);
	});
});
