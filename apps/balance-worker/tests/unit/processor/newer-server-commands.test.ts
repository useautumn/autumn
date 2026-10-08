/**
 * Commands from a newer server: a field this build does not know, or an optional one left out, is still decided,
 * over HTTP and off the command topic. A strict parse used to answer the first with a 400 or skip it as unreadable.
 */

import { describe, expect, test } from "bun:test";
import type { CommandOrg, EvictCommand } from "@autumn/balance-engine";
import type { CommandRecord } from "@autumn/kafka";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import {
	type CommandPipeline,
	createCommandPipeline,
	identityOf,
} from "../../fixtures/commandPipeline.js";
import { testOccurredAt } from "../../fixtures/mutations.js";
import {
	resetOf,
	trackOf,
	updateBalanceOf,
} from "../../fixtures/queuedCommands.js";

/** `identity` is left alone: it is the record's own key, which the worker writes and keeps strict. */
const fromNewerServer = <Command extends CommandRecord>(command: Command) => {
	const org = "org" in command ? (command.org as CommandOrg) : undefined;
	return {
		...command,
		futureField: true,
		...(org && {
			org: { ...org, config: { ...org.config, future_setting: true } },
		}),
	} as Command;
};

/** No `refreshSnapshots`: the optional flag is absent, as an older server sends it. */
const evictOf = ({ customerId }: { customerId: string }): EvictCommand => ({
	schemaVersion: 1,
	type: "evict",
	requestId: `req_evict_${customerId}`,
	identity: identityOf({ customerId }),
	occurredAt: testOccurredAt,
});

/** Each command twice: as an older server sends it, then with a newer server's fields. */
const asBothServersSend = (commands: CommandRecord[]) =>
	commands.flatMap((command) => [
		command,
		fromNewerServer({
			...command,
			...("commandId" in command && { commandId: `${command.commandId}_new` }),
		}),
	]);

const withPipeline = async (
	run: (pipeline: CommandPipeline) => Promise<void>,
) => {
	const pipeline = createCommandPipeline();
	try {
		await run(pipeline);
	} finally {
		await pipeline.close();
	}
};

describe("commands from a newer server", () => {
	test("queued track, reset, updateBalance and evict are decided, not skipped as unreadable", () =>
		withPipeline(async (pipeline) => {
			const commands = asBothServersSend([
				trackOf({ customerId: "cus_1", commandId: "track" }),
				resetOf({ customerId: "cus_1", commandId: "reset" }),
				updateBalanceOf({ customerId: "cus_1", commandId: "update" }),
				evictOf({ customerId: "cus_2" }),
			]);

			await pipeline.consumeBatch({ commands });
			await pipeline.drain();

			expect(pipeline.logs.filter((line) => line.startsWith("warn:"))).toEqual(
				[],
			);
			expect(pipeline.parked).toEqual([]);
			expect(pipeline.readBookmark()).toBe(BigInt(commands.length));
			expect(
				pipeline.commits.flat().map(({ command }) => command.commandId),
			).toEqual(["track", "track_new", "update", "update_new"]);
		}));

	test("an evict and a reset over HTTP are answered, not refused as invalid", () =>
		withPipeline(async (pipeline) => {
			const app = createBalanceWorkerApp({
				ctx: {
					ownership: {
						findRuntime: () => ({ process: (run) => run(pipeline.processor) }),
					},
					partitionResolver: { partitionForIdentity: () => 0 },
					logger: {
						debug: () => undefined,
						info: () => undefined,
						warn: () => undefined,
						error: () => undefined,
					},
				},
			});
			const post = ({ path, command }: { path: string; command: unknown }) =>
				app.request(path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						route: { partition: 0, routeEpoch: "1" },
						command,
					}),
				});

			const responses = await Promise.all([
				...asBothServersSend([evictOf({ customerId: "cus_2" })]).map(
					(command) => post({ path: "/v1/evict", command }),
				),
				...asBothServersSend([
					resetOf({ customerId: "cus_1", commandId: "reset" }),
				]).map((command) => post({ path: "/v1/reset", command })),
			]);

			expect(responses.map((response) => response.status)).toEqual([
				200, 200, 200, 200,
			]);
		}));
});
