import { expect, test } from "bun:test";
import type { EvictCommand, TrackCommand } from "@autumn/balance-engine";
import type { CommandAppend } from "@autumn/kafka";
import { meteringIdentityToPartition } from "@autumn/kafka/partitioning";
import { createBalanceWorkerClient } from "../src/balanceWorkerClient.js";

const partitionCount = 8;

const trackFor = ({ customerId }: { customerId: string }): TrackCommand => ({
	schemaVersion: 1,
	type: "track",
	org: {
		config: {
			reverse_deduction_order: false,
			block_overdue_entitlements: false,
			include_past_due: true,
		},
	},
	commandId: `cmd_${customerId}`,
	requestId: "request",
	identity: { orgId: "org", env: "sandbox", customerId, entityId: null },
	featureId: "feature",
	internalFeatureId: "feat_feature",
	value: 1,
	overageBehavior: "reject",
	properties: null,
	usageEvent: { name: "feature", idempotencyKey: null, id: null },
	occurredAt: 0,
});

function createFixture({ withCommandLog = true, hang = false } = {}) {
	const appends: CommandAppend[] = [];
	const commandLog = {
		append: async (params: CommandAppend) => {
			if (hang) await new Promise<never>(() => undefined);
			appends.push(params);
		},
	};
	const client = createBalanceWorkerClient({
		ctx: {
			owners: { findOwner: () => undefined, refresh: async () => undefined },
			http: { postJson: async () => ({ status: 500, body: null }) },
			...(withCommandLog && { commandLog }),
		},
		config: {
			partitionCount,
			timeoutMs: 1_000,
			appendTimeoutMs: hang ? 5_000 : undefined,
		},
	});
	return { client, appends };
}

test("enqueue appends the batch once, each command on the partition its owner routes by", async () => {
	const { client, appends } = createFixture();
	const commands = [
		trackFor({ customerId: "a" }),
		trackFor({ customerId: "b" }),
		trackFor({ customerId: "a" }),
	];
	await client.enqueue({ commands });
	expect(appends).toEqual([
		{
			records: commands.map((command) => ({
				partition: meteringIdentityToPartition({
					identity: command.identity,
					partitionCount,
				}),
				command,
			})),
		},
	]);
});

test("queue.track is the typed door onto the same append", async () => {
	const { client, appends } = createFixture();
	const command = trackFor({ customerId: "a" });
	await client.queue.track({ commands: [command] });
	expect(appends).toEqual([
		{
			records: [
				{
					partition: meteringIdentityToPartition({
						identity: command.identity,
						partitionCount,
					}),
					command,
				},
			],
		},
	]);
});

test("queue.evict is a typed door too", async () => {
	const { client, appends } = createFixture();
	const command: EvictCommand = {
		schemaVersion: 1,
		type: "evict",
		requestId: "request",
		identity: { orgId: "org", env: "sandbox", customerId: "a", entityId: null },
		occurredAt: 0,
	};
	await client.queue.evict({ commands: [command] });
	expect(appends).toEqual([
		{
			records: [
				{
					partition: meteringIdentityToPartition({
						identity: command.identity,
						partitionCount,
					}),
					command,
				},
			],
		},
	]);
});

test("enqueue of nothing appends nothing", async () => {
	const { client, appends } = createFixture();
	await client.enqueue({ commands: [] });
	expect(appends).toEqual([]);
});

test("a client without a command log refuses to enqueue, and says so", async () => {
	const { client } = createFixture({ withCommandLog: false });
	await expect(
		client.enqueue({ commands: [trackFor({ customerId: "a" })] }),
	).rejects.toMatchObject({
		code: "COMMAND_LOG_UNAVAILABLE",
		outcome: "not_submitted",
	});
});

const evictFor = ({ customerId }: { customerId: string }): EvictCommand => ({
	schemaVersion: 1,
	type: "evict",
	requestId: "request",
	identity: { orgId: "org", env: "sandbox", customerId, entityId: null },
	occurredAt: 0,
});

test("an append that outlives the client's budget fails as a deadline with an unknown outcome, and its late failure is nobody's unhandled rejection", async () => {
	const unhandled: unknown[] = [];
	const onUnhandled = (reason: unknown) => unhandled.push(reason);
	process.on("unhandledRejection", onUnhandled);
	const lateFailure = Promise.withResolvers<void>();
	const client = createBalanceWorkerClient({
		ctx: {
			owners: { findOwner: () => undefined, refresh: async () => undefined },
			http: { postJson: async () => ({ status: 500, body: null }) },
			commandLog: { append: () => lateFailure.promise },
		},
		config: { partitionCount, timeoutMs: 1_000, appendTimeoutMs: 20 },
	});
	try {
		await expect(
			client.queue.evict({ commands: [evictFor({ customerId: "a" })] }),
		).rejects.toMatchObject({ code: "DEADLINE", outcome: "unknown" });
		lateFailure.reject(new Error("broker gave up later"));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(unhandled).toEqual([]);
	} finally {
		process.off("unhandledRejection", onUnhandled);
	}
});

test("a caller's own signal aborts the wait with an abort, not a deadline", async () => {
	const { client } = createFixture({ hang: true });
	const controller = new AbortController();
	const pending = client.queue.evict({
		commands: [evictFor({ customerId: "a" })],
		signal: controller.signal,
	});
	controller.abort(new Error("caller moved on"));
	await expect(pending).rejects.toMatchObject({
		code: "ABORTED",
		outcome: "unknown",
	});
});
