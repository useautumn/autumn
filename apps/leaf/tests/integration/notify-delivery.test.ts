/**
 * NOTIFY delivery against a real Postgres: the precondition for eve getting a
 * durable world at all. Needs CHAT_DATABASE_URL pointing at that database.
 */

import { describe, expect, test } from "bun:test";

const url = process.env.CHAT_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb("workflow world preconditions (real Postgres)", () => {
	test("NOTIFY delivery is proven on a direct connection", async () => {
		const { verifyNotifyDelivery } = await import(
			"../../src/internal/agentRuntime/eve/verifyNotifyDelivery.js"
		);
		expect(
			await verifyNotifyDelivery({ connectionString: url as string }),
		).toBe(true);
	});
});
