import { expect, test } from "bun:test";
import { ApiCustomerV5Schema } from "../../../shared/api/customers/apiCustomerV5.js";
import { ApiEntityV2Schema } from "../../../shared/api/entities/apiEntityV2.js";
import { FailOpenHook } from "../src/hooks/failOpenHook.js";
import { Autumn } from "../src/sdk/sdk.js";

const operations = [
	{
		name: "check",
		call: (client: Autumn) =>
			client.check({ customerId: "customer_123", featureId: "messages" }),
		expected: { allowed: true, balance: null, flag: null },
	},
	{
		name: "track",
		call: (client: Autumn) =>
			client.track({
				customerId: "customer_123",
				featureId: "messages",
				value: 1,
			}),
		expected: { value: 0, balance: null },
	},
	{
		name: "getOrCreateCustomer",
		call: (client: Autumn) =>
			client.customers.getOrCreate({ customerId: "customer_123" }),
		expected: { id: null, licenses: [], subscriptions: [], balances: {} },
	},
	{
		name: "getEntity",
		call: (client: Autumn) =>
			client.entities.get({
				customerId: "customer_123",
				entityId: "entity_123",
			}),
		expected: { id: null, subscriptions: [], balances: {} },
	},
];

for (const operation of operations) {
	test(`${operation.name} fails open through the generated response validator`, async () => {
		let requests = 0;
		const server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch() {
				requests++;
				return Response.json({ message: "Synthetic outage" }, { status: 503 });
			},
		});
		try {
			const client = new Autumn({
				secretKey: "test",
				serverURL: `http://127.0.0.1:${server.port}`,
				retryConfig: { strategy: "none" },
			});
			expect(await operation.call(client)).toMatchObject(operation.expected);
			expect(requests).toBe(1);
		} finally {
			await server.stop(true);
		}
	});
}

for (const [operationID, schema] of [
	["getOrCreateCustomer", ApiCustomerV5Schema],
	["getEntity", ApiEntityV2Schema],
] as const) {
	test(`${operationID} fallback satisfies the current shared response schema`, async () => {
		const result = await new FailOpenHook().afterError(
			{
				operationID,
				baseURL: "http://127.0.0.1",
				oAuth2Scopes: null,
				retryConfig: { strategy: "none" },
				resolvedSecurity: null,
				options: {},
			},
			new Response(null, { status: 503 }),
			null,
		);
		expect(result.error).toBeNull();
		expect(result.response?.status).toBe(200);
		schema.parse(await result.response?.json());
	});
}
