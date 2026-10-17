import { describe, expect, test } from "bun:test";
import type { PostgresClient } from "@autumn/postgres";
import { readFleetProgress } from "../../../../src/health/stepDown/readFleetProgress.js";

describe("read fleet progress", () => {
	test("a read that fails on one side settles only after the other side has", async () => {
		const query = Promise.withResolvers<{ rows: Record<string, unknown>[] }>();
		const db = {
			execute: () => query.promise,
		} as unknown as PostgresClient["db"];
		const partitionOffsets = {
			fetchTopicOffsets: async () => {
				throw new Error("Kafka did not answer");
			},
		};
		const settled = { done: false };
		const reading = readFleetProgress({
			ctx: { partitionOffsets, db },
			topic: "metering",
		});
		function noteSettled(): void {
			settled.done = true;
		}
		reading.catch(noteSettled);
		await Bun.sleep(10);
		expect(settled.done).toBe(false);
		query.resolve({ rows: [] });
		await expect(reading).rejects.toThrow("Kafka did not answer");
	});
});
