import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fetchSlackUserEmailCached } from "../../../../src/providers/slack/users.js";

const originalFetch = globalThis.fetch;

const mockFetch = (handler: () => Promise<Response>) =>
	Object.assign(handler, { preconnect: originalFetch.preconnect });

describe("Slack users", () => {
	beforeEach(() => {
		globalThis.fetch = originalFetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("caches stable null email lookups", async () => {
		let fetchCalls = 0;
		globalThis.fetch = mockFetch(async () => {
			fetchCalls += 1;
			return Response.json({
				ok: true,
				user: { id: "U_BOT", is_bot: true, profile: {} },
			});
		});

		const params = {
			botToken: "xoxb-token",
			installationId: "chat_inst_null_cache",
			slackUserId: "U_BOT",
		};

		await expect(fetchSlackUserEmailCached(params)).resolves.toBeNull();
		await expect(fetchSlackUserEmailCached(params)).resolves.toBeNull();
		expect(fetchCalls).toBe(1);
	});

	test("does not cache transient Slack lookup failures", async () => {
		let fetchCalls = 0;
		globalThis.fetch = mockFetch(async () => {
			fetchCalls += 1;
			throw new Error("Slack unavailable");
		});

		const params = {
			botToken: "xoxb-token",
			installationId: "chat_inst_transient_failure",
			slackUserId: "U_TRANSIENT",
		};

		await expect(fetchSlackUserEmailCached(params)).resolves.toBeNull();
		await expect(fetchSlackUserEmailCached(params)).resolves.toBeNull();
		expect(fetchCalls).toBe(2);
	});
});
