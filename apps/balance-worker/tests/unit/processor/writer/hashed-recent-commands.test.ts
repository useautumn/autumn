import { describe, expect, test } from "bun:test";
import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import { pendingKeyOf } from "../../../../src/processor/writer/pendingMutations.js";
import { createHashedRecentCommands } from "../../../../src/processor/writer/recentCommands/createHashedRecentCommands.js";
import { createRecentCommands } from "../../../../src/processor/writer/recentCommands/createRecentCommands.js";
import type { RecentCommands } from "../../../../src/processor/writer/recentCommands/types/recentCommands.js";
import {
	createState,
	createTrackMutation,
	testIdentity,
} from "../../../fixtures/mutations.js";

const WINDOW_MS = 1_000;

const stores: Record<
	string,
	(params: { windowMs: number; now(): number }) => RecentCommands
> = {
	map: createRecentCommands,
	hashed: (params) =>
		createHashedRecentCommands({ ...params, expectedCommands: 16 }),
};

const keyOf = (commandId: string) =>
	pendingKeyOf({
		customerKey: meteringIdentityToPartitionKey({ identity: testIdentity }),
		commandId,
	});

describe.each(Object.entries(stores))("%s recent commands", (_, create) => {
	const createClocked = () => {
		const clock = { now: 0 };
		return {
			clock,
			commands: create({ windowMs: WINDOW_MS, now: () => clock.now }),
		};
	};

	test("recalls a remembered command as the same request, another fingerprint as different, the rest as unknown", () => {
		const { commands } = createClocked();
		commands.remember({ key: keyOf("cmd_1"), fingerprint: "fp_a" });
		expect(commands.recall({ key: keyOf("cmd_1"), fingerprint: "fp_a" })).toBe(
			"same",
		);
		expect(commands.recall({ key: keyOf("cmd_1"), fingerprint: "fp_b" })).toBe(
			"different",
		);
		expect(commands.recall({ key: keyOf("cmd_2"), fingerprint: "fp_a" })).toBe(
			"unknown",
		);
		expect(commands.size()).toBe(1);
	});

	test("a replayed record is remembered under the writer's own key", () => {
		const { commands } = createClocked();
		const mutation = createTrackMutation({
			state: createState(),
			commandId: "cmd_r",
		});
		commands.remember({ mutation });
		expect(commands.keyOf({ identity: testIdentity, commandId: "cmd_r" })).toBe(
			keyOf("cmd_r"),
		);
		expect(
			commands.recall({
				key: keyOf("cmd_r"),
				fingerprint: mutation.receipt.fingerprint,
			}),
		).toBe("same");
	});

	test("keeps a command for at least one window and at most two, and forgets after a quiet stretch", () => {
		const { clock, commands } = createClocked();
		clock.now = WINDOW_MS - 1;
		commands.remember({ key: keyOf("cmd_1"), fingerprint: "fp" });
		clock.now = 2 * WINDOW_MS - 1;
		expect(commands.recall({ key: keyOf("cmd_1"), fingerprint: "fp" })).toBe(
			"same",
		);
		clock.now = 2 * WINDOW_MS;
		expect(commands.recall({ key: keyOf("cmd_1"), fingerprint: "fp" })).toBe(
			"unknown",
		);
		expect(commands.size()).toBe(0);
		commands.remember({ key: keyOf("cmd_2"), fingerprint: "fp" });
		clock.now = 7 * WINDOW_MS;
		expect(commands.recall({ key: keyOf("cmd_2"), fingerprint: "fp" })).toBe(
			"unknown",
		);
		expect(commands.size()).toBe(0);
	});

	test("remembering again restarts the command's window and counts it once", () => {
		const { clock, commands } = createClocked();
		commands.remember({ key: keyOf("cmd_1"), fingerprint: "fp" });
		clock.now = WINDOW_MS;
		commands.remember({ key: keyOf("cmd_1"), fingerprint: "fp2" });
		expect(commands.size()).toBe(1);
		clock.now = 2 * WINDOW_MS;
		expect(commands.recall({ key: keyOf("cmd_1"), fingerprint: "fp2" })).toBe(
			"same",
		);
		expect(commands.recall({ key: keyOf("cmd_1"), fingerprint: "fp" })).toBe(
			"different",
		);
	});

	test("a settled batch is remembered under one clock read and found across the rotation", () => {
		const { clock, commands } = createClocked();
		commands.rememberAll({
			commands: [
				{ key: keyOf("cmd_1"), fingerprint: "fp_1" },
				{ key: keyOf("cmd_2"), fingerprint: "fp_2" },
			],
		});
		expect(commands.size()).toBe(2);
		clock.now = WINDOW_MS + 1;
		expect(commands.recall({ key: keyOf("cmd_1"), fingerprint: "fp_1" })).toBe(
			"same",
		);
		expect(commands.recall({ key: keyOf("cmd_2"), fingerprint: "fp_x" })).toBe(
			"different",
		);
	});

	test("holds far more commands than its initial room and still answers every one", () => {
		const { commands } = createClocked();
		const count = 5_000;
		for (let i = 0; i < count; i++)
			commands.remember({ key: keyOf(`cmd_${i}`), fingerprint: `fp_${i}` });
		expect(commands.size()).toBe(count);
		for (let i = 0; i < count; i += 97)
			expect(
				commands.recall({ key: keyOf(`cmd_${i}`), fingerprint: `fp_${i}` }),
			).toBe("same");
		expect(commands.recall({ key: keyOf("cmd_5000"), fingerprint: "fp" })).toBe(
			"unknown",
		);
	});
});
