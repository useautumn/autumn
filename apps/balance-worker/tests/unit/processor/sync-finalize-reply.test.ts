/**
 * A sync finalize answers the server with its result alone. The server reads nothing else of the reply
 * (runBalanceWorkerFinalize), and a reply carrying the customer's state grew with its open locks past the client's
 * 1 MiB cap on staging (#390: 3,147 finalize 500s on the hot customer with 8,590 locks open).
 */

import { describe, expect, test } from "bun:test";
import { createCommandPipeline } from "../../fixtures/commandPipeline.js";
import { finalizeOf, takeLock } from "../../fixtures/queuedCommands.js";

const replyBytesAfterLocks = async ({ locks }: { locks: number }) => {
	const pipeline = createCommandPipeline();
	try {
		const customerId = "cus_1";
		const held = [];
		for (let i = 0; i < locks; i++)
			held.push(
				await takeLock({ pipeline, customerId, lockId: `L${i}`, value: 1 }),
			);
		const first = held[0];
		if (!first) throw new Error("Expected a lock");
		const reply = await pipeline.processor.finalize({
			command: finalizeOf({ lock: first, finalValue: null }),
		});
		return { reply, bytes: JSON.stringify(reply).length };
	} finally {
		await pipeline.close();
	}
};

describe("a sync finalize's reply", () => {
	test("carries the result alone, so it stays the same size however many locks the customer holds open", async () => {
		const [one, many] = await Promise.all([
			replyBytesAfterLocks({ locks: 1 }),
			replyBytesAfterLocks({ locks: 60 }),
		]);

		expect(one.reply.result.status).toBe("applied");
		expect(Object.keys(one.reply)).toEqual(["result"]);
		expect(many.bytes).toBe(one.bytes);
	});
});
