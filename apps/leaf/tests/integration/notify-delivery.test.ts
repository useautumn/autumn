/**
 * NOTIFY delivery against a real Postgres: the precondition for eve getting a
 * durable world at all. Needs CHAT_DATABASE_URL pointing at that database;
 * CHAT_DATABASE_DIRECT_URL, when set, carries the LISTEN side as in prod.
 */

import { describe, expect, test } from "bun:test";

const url = process.env.CHAT_DATABASE_URL;
const describeWithDb = url ? describe : describe.skip;

describeWithDb("workflow world preconditions (real Postgres)", () => {
	test("NOTIFY through the chat URL reaches the world's listener", async () => {
		const { verifyNotifyDelivery } = await import(
			"../../src/internal/agentRuntime/eve/verifyNotifyDelivery.js"
		);
		expect(
			await verifyNotifyDelivery({
				listenUrl: process.env.CHAT_DATABASE_DIRECT_URL || (url as string),
				notifyUrl: url as string,
			}),
		).toBe(true);
	});
});
