import { afterEach, describe, expect, mock, test } from "bun:test";
import { callAutumn } from "../../../src/tools/utils/client.js";

const auth = {
	apiKey: "am_sk_test",
	env: "sandbox" as const,
	principalId: "test",
	resource: "test",
	scopes: [],
	serverURL: "https://api.example.com",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("callAutumn", () => {
	test("retries a transient connection failure for retryable calls", async () => {
		const fetch = mock()
			.mockResolvedValueOnce(
				Response.json(
					{ message: "Connection terminated unexpectedly" },
					{ status: 500 },
				),
			)
			.mockResolvedValueOnce(Response.json({ id: "customer" }));
		globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

		expect(
			await callAutumn({
				auth,
				endpoint: "/v1/customers.get",
				request: { customer_id: "customer" },
				retryable: true,
			}),
		).toEqual({ id: "customer" });
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	test("does not retry writes", async () => {
		const fetch = mock().mockResolvedValue(
			Response.json(
				{ message: "Connection terminated unexpectedly" },
				{ status: 500 },
			),
		);
		globalThis.fetch = fetch as unknown as typeof globalThis.fetch;

		await expect(
			callAutumn({
				auth,
				endpoint: "/v1/billing.attach",
				request: {},
			}),
		).rejects.toThrow("Connection terminated unexpectedly");
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
