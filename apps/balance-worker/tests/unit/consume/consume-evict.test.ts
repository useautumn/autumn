import { expect, test } from "bun:test";
import { type EvictCommand, parseEvictCommand } from "@autumn/balance-engine";
import { consumeEvict } from "../../../src/consume/consumeEvict.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { testIdentity } from "../../fixtures/mutations.js";

const command = (): EvictCommand =>
	parseEvictCommand({
		input: {
			schemaVersion: 1,
			type: "evict",
			requestId: "req_evict",
			identity: testIdentity,
			occurredAt: 1_700_000_000_000,
		},
	});

test("a queued evict reaches the processor's evict as the command it carries", async () => {
	const evicted: EvictCommand[] = [];
	const processor = {
		evict: async ({ command }: { command: EvictCommand }) => {
			evicted.push(command);
			return { evicted: true };
		},
	} as unknown as PartitionProcessor;
	await consumeEvict({ ctx: { processor }, command: command() });
	expect(evicted).toEqual([command()]);
});
