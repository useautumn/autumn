import { expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
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
	occurredAt: 0,
});

function createFixture({ withCommandLog = true } = {}) {
	const appends: CommandAppend[] = [];
	const commandLog = {
		append: async (params: CommandAppend) => {
			appends.push(params);
		},
	};
	const client = createBalanceWorkerClient({
		ctx: {
			owners: { findOwner: () => undefined, refresh: async () => undefined },
			http: { postJson: async () => ({ status: 500, body: null }) },
			...(withCommandLog && { commandLog }),
		},
		config: { partitionCount, timeoutMs: 1_000 },
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
