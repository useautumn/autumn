import { describe, expect, test } from "bun:test";
import type { LogRequestContext } from "@/utils/logging/loggerTypes.js";
import { buildRequestLogContexts } from "@/utils/logging/requestLogContext.js";

describe("request log context", () => {
	test("keeps the complete body once on the terminal record", () => {
		const requestContext: LogRequestContext = {
			id: "req_123",
			method: "POST",
			url: "https://api.useautumn.com/v1/balances.check",
			timestamp: 123,
			customer_id: "cus_123",
			entity_id: "ent_123",
			user_agent: "test-agent",
			ip_address: "127.0.0.1",
			region: "us-east-2",
			query: { expand: "balances" },
			body: {
				customer_id: "cus_123",
				feature_id: "messages",
			},
			name: "POST /v1/balances.check",
		};

		const contexts = buildRequestLogContexts({ requestContext });

		expect(contexts.terminal).toEqual(requestContext);
		expect(contexts.internal).toEqual({
			id: "req_123",
			method: "POST",
			url: "https://api.useautumn.com/v1/balances.check",
			timestamp: 123,
			customer_id: "cus_123",
			entity_id: "ent_123",
			user_agent: "test-agent",
			ip_address: "127.0.0.1",
			region: "us-east-2",
			query: { expand: "balances" },
			name: "POST /v1/balances.check",
		});
		expect("body" in contexts.internal).toBe(false);
	});

	test("keeps the terminal context and body by reference without copying payloads", () => {
		const body = {
			items: Array.from({ length: 100 }, (_, index) => ({ index })),
		};
		const requestContext: LogRequestContext = {
			id: "req_large",
			method: "POST",
			url: "https://api.useautumn.com/v1/track",
			timestamp: 123,
			query: {},
			body,
			name: "POST /v1/track",
		};

		const contexts = buildRequestLogContexts({ requestContext });

		expect(contexts.terminal).toBe(requestContext);
		expect(contexts.terminal.body).toBe(body);
		expect("body" in contexts.internal).toBe(false);
	});
});
