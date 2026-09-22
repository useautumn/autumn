import { describe, expect, test } from "bun:test";
import { parseResetCommand, type ResetCommand } from "@autumn/balance-engine";
import { consumeReset } from "../../../src/consume/consumeReset.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { PartitionWriterDuplicateCommandError } from "../../../src/processor/writer/writerErrors.js";
import { testIdentity, testOrg } from "../../fixtures/mutations.js";

const command = (): ResetCommand =>
	parseResetCommand({
		input: {
			schemaVersion: 1,
			type: "reset",
			commandId: "reset_cus_1_1",
			requestId: "reset_cus_1_1",
			identity: testIdentity,
			occurredAt: 1_700_000_000_000,
			org: testOrg,
		},
	});

function createFixture({ outcome }: { outcome: "refilled" | "idle" | Error }) {
	const logs: string[] = [];
	const processor = {
		reset: async () => {
			if (outcome instanceof Error) throw outcome;
			return {
				result:
					outcome === "idle" ? null : { type: "reset" as const, rows: [] },
			};
		},
	} as unknown as PartitionProcessor;
	const ctx = {
		processor,
		logger: {
			info: (message: string) => logs.push(`info:${message}`),
			warn: (message: string) => logs.push(`warn:${message}`),
		} as never,
	};
	return { ctx, logs };
}

describe("consumeReset", () => {
	test("a refill settles quietly; an idle reset says so", async () => {
		const refilled = createFixture({ outcome: "refilled" });
		await consumeReset({ ctx: refilled.ctx, command: command() });
		expect(refilled.logs).toEqual([]);

		const idle = createFixture({ outcome: "idle" });
		await consumeReset({ ctx: idle.ctx, command: command() });
		expect(idle.logs).toEqual(["info:Queued reset found nothing due"]);
	});

	test("a failure is not the consumer's to settle: it reaches the stream's boundary", async () => {
		const fixture = createFixture({
			outcome: new PartitionWriterDuplicateCommandError({
				commandId: "reset_cus_1_1",
			}),
		});
		await expect(
			consumeReset({ ctx: fixture.ctx, command: command() }),
		).rejects.toBeInstanceOf(PartitionWriterDuplicateCommandError);
		expect(fixture.logs).toEqual([]);
	});
});
