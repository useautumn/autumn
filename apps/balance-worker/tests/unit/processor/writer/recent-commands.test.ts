import { describe, expect, test } from "bun:test";
import type { MutationRecord } from "@autumn/balance-engine";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import {
	createState,
	createTrackMutation,
	testIdentity,
} from "../../../fixtures/mutations.js";

const WINDOW_MS = 1_000;

const createClockedCommands = () => {
	const clock = { now: 0 };
	const commands = createRecentCommands({
		windowMs: WINDOW_MS,
		now: () => clock.now,
	});
	return { clock, commands };
};

const recordOf = ({ commandId }: { commandId: string }): MutationRecord =>
	createTrackMutation({ state: createState(), commandId });

const readOf = (commandId: string) => ({ identity: testIdentity, commandId });

describe("createRecentCommands", () => {
	test("remembers a record by its command id, with the fingerprint a retry must match", () => {
		const { commands } = createClockedCommands();
		const mutation = recordOf({ commandId: "cmd_1" });
		commands.remember({ mutation });
		expect(commands.read(readOf("cmd_1"))).toEqual({
			fingerprint: mutation.receipt.fingerprint,
		});
		expect(commands.read(readOf("cmd_9"))).toBeNull();
	});

	test("the customer is part of the key: another customer's same command id is unknown", () => {
		const { commands } = createClockedCommands();
		commands.remember({ mutation: recordOf({ commandId: "cmd_1" }) });
		expect(
			commands.read({
				identity: { ...testIdentity, customerId: "someone_else" },
				commandId: "cmd_1",
			}),
		).toBeNull();
	});

	test("has no cap per customer: every command inside the window is kept", () => {
		const { commands } = createClockedCommands();
		const commandCount = 1_000;
		for (let index = 0; index < commandCount; index++)
			commands.remember({ mutation: recordOf({ commandId: `cmd_${index}` }) });
		expect(commands.read(readOf("cmd_0"))).not.toBeNull();
		expect(commands.size()).toBe(commandCount);
	});

	test("keeps a command for at least one window and at most two", () => {
		const { clock, commands } = createClockedCommands();
		clock.now = WINDOW_MS - 1;
		commands.remember({ mutation: recordOf({ commandId: "cmd_1" }) });

		clock.now = 2 * WINDOW_MS - 1;
		expect(commands.read(readOf("cmd_1"))).not.toBeNull();

		clock.now = 2 * WINDOW_MS;
		expect(commands.read(readOf("cmd_1"))).toBeNull();
		expect(commands.size()).toBe(0);
	});

	test("forgets everything after a quiet stretch longer than two windows", () => {
		const { clock, commands } = createClockedCommands();
		commands.remember({ mutation: recordOf({ commandId: "cmd_1" }) });
		clock.now = 5 * WINDOW_MS;
		expect(commands.read(readOf("cmd_1"))).toBeNull();
	});

	test("remembering again restarts the command's window", () => {
		const { clock, commands } = createClockedCommands();
		commands.remember({ mutation: recordOf({ commandId: "cmd_1" }) });
		clock.now = WINDOW_MS;
		commands.remember({ mutation: recordOf({ commandId: "cmd_1" }) });
		expect(commands.size()).toBe(1);

		clock.now = 2 * WINDOW_MS;
		expect(commands.read(readOf("cmd_1"))).not.toBeNull();
	});
});
