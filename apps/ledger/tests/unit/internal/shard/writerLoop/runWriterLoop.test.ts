import { describe, expect, it } from "bun:test";
import { AppEnv, CustomerNotFoundError } from "@autumn/shared";
import type { Command } from "../../../../../src/api/types/command.js";
import type { CommandResult } from "../../../../../src/api/types/commandResult.js";
import { createCommandQueue } from "../../../../../src/internal/shard/commandQueue/createCommandQueue.js";
import type { CommandRunner } from "../../../../../src/internal/shard/types/commandRunner.js";
import { runWriterLoop } from "../../../../../src/internal/shard/writerLoop/runWriterLoop.js";
import { subjectToKey } from "../../../../../src/internal/subjects/subjectToKey.js";
import { createTestShardContext } from "../../../testUtils/createTestShardContext.js";

const SUBJECT_KEY = subjectToKey({
	orgId: "org_1",
	env: AppEnv.Sandbox,
	customerId: "cus_1",
});

const commandWithId = (id: string): Command => ({
	id,
	org_id: "org_1",
	env: AppEnv.Sandbox,
	customer_id: "cus_1",
	at: 1_700_000_000_000,
	api_version: "1.2",
	kind: "track",
	body: { customer_id: "cus_1", feature_id: "messages", value: 1 },
});

const busyWaitMs = (ms: number) => {
	const until = performance.now() + ms;
	while (performance.now() < until) {
		// hold the thread: a slow fold, not an await
	}
};

const startLoop = ({
	runCommand,
	resident = true,
	importFails = false,
}: {
	runCommand: CommandRunner;
	resident?: boolean;
	importFails?: boolean;
}) => {
	const queue = createCommandQueue();
	const ctx = createTestShardContext();
	if (resident) ctx.subjects.markResident({ key: SUBJECT_KEY });

	const importedKeys: string[] = [];
	ctx.subjects.loadOnce = ({ key }) => {
		importedKeys.push(key);
		if (importFails) {
			return Promise.reject(new CustomerNotFoundError({ customerId: "cus_1" }));
		}
		ctx.subjects.markResident({ key });
		return Promise.resolve();
	};

	const appends: number[] = [];
	const journalAppend = ctx.journal.append;
	ctx.journal.append = ({ entries }) => {
		appends.push(entries.length);
		return journalAppend({ entries });
	};
	const loop = runWriterLoop({ ctx, queue, runCommand });

	return {
		appends,
		importedKeys,
		submit: (command: Command) =>
			new Promise<CommandResult>((resolve) => {
				queue.push({ command, resolve });
			}),
		stop: async () => {
			queue.close();
			await loop;
		},
	};
};

const okRunner: CommandRunner = ({ command }) => ({
	result: { id: command.id, status: 200, body: null },
});

describe("runWriterLoop", () => {
	it("resolves every queued command, in order", async () => {
		const applied: string[] = [];
		const loop = startLoop({
			runCommand: ({ command }) => {
				applied.push(command.id);
				return { result: { id: command.id, status: 200, body: null } };
			},
		});

		const results = await Promise.all([
			loop.submit(commandWithId("cmd_1")),
			loop.submit(commandWithId("cmd_2")),
		]);

		expect(applied).toEqual(["cmd_1", "cmd_2"]);
		expect(results.map(({ id }) => id)).toEqual(["cmd_1", "cmd_2"]);
		expect(results.map(({ status }) => status)).toEqual([200, 200]);

		await loop.stop();
	});

	it("fails one command without poisoning the rest of the batch", async () => {
		const loop = startLoop({
			runCommand: ({ command }) => {
				if (command.id === "cmd_bad") throw new Error("fold blew up");
				return { result: { id: command.id, status: 200, body: null } };
			},
		});

		const [failed, succeeded] = await Promise.all([
			loop.submit(commandWithId("cmd_bad")),
			loop.submit(commandWithId("cmd_good")),
		]);

		expect(failed?.status).toBe(500);
		expect(succeeded?.status).toBe(200);

		await loop.stop();
	});

	it("defers commands past the slice budget to the next slice", async () => {
		const loop = startLoop({
			runCommand: ({ command }) => {
				busyWaitMs(2);
				return { result: { id: command.id, status: 200, body: null } };
			},
		});

		const results = await Promise.all([
			loop.submit(commandWithId("cmd_1")),
			loop.submit(commandWithId("cmd_2")),
		]);

		expect(results.map(({ status }) => status)).toEqual([200, 200]);
		// Two slow folds cannot share a 1 ms slice: one append per command.
		expect(loop.appends).toEqual([0, 0]);

		await loop.stop();
	});

	it("defers commands for an unseen subject and folds them once it lands", async () => {
		const applied: string[] = [];
		const loop = startLoop({
			resident: false,
			runCommand: ({ command }) => {
				applied.push(command.id);
				return { result: { id: command.id, status: 200, body: null } };
			},
		});

		const results = await Promise.all([
			loop.submit(commandWithId("cmd_1")),
			loop.submit(commandWithId("cmd_2")),
		]);

		expect(results.map(({ status }) => status)).toEqual([200, 200]);
		expect(applied.sort()).toEqual(["cmd_1", "cmd_2"]);
		expect(loop.importedKeys).toEqual([SUBJECT_KEY, SUBJECT_KEY]);

		await loop.stop();
	});

	it("answers the caller when the import finds no subject", async () => {
		const loop = startLoop({
			resident: false,
			importFails: true,
			runCommand: okRunner,
		});

		const result = await loop.submit(commandWithId("cmd_1"));

		expect(result.status).toBe(404);
		expect(result.body).toMatchObject({ code: "customer_not_found" });

		await loop.stop();
	});
});
