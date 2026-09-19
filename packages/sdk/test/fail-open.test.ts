import { expect, test } from "bun:test";
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

for (const operationID of [
	"getOrCreateCustomer",
	"getCustomer",
	"getEntity",
	"getOrCreateEntity",
	"createEntity",
]) {
	test(`${operationID} preserves the original error response`, async () => {
		const response = new Response(null, { status: 503 });
		const error = new Error("Synthetic outage");
		const result = await new FailOpenHook().afterError(
			{
				operationID,
				baseURL: "http://127.0.0.1",
				oAuth2Scopes: null,
				retryConfig: { strategy: "none" },
				resolvedSecurity: null,
				options: {},
			},
			response,
			error,
		);
		expect(result.error).toBe(error);
		expect(result.response).toBe(response);
	});
}

for (const operation of [
	{
		name: "getOrCreateCustomer",
		call: (client: Autumn) =>
			client.customers.getOrCreate({ customerId: "customer_123" }),
	},
	{
		name: "getCustomer",
		call: (client: Autumn) =>
			client.customers.get({ customerId: "customer_123" }),
	},
	{
		name: "getEntity",
		call: (client: Autumn) =>
			client.entities.get({
				customerId: "customer_123",
				entityId: "entity_123",
			}),
	},
	{
		name: "createEntity",
		call: (client: Autumn) =>
			client.entities.create({
				customerId: "customer_123",
				entityId: "entity_123",
				featureId: "seats",
			}),
	},
]) {
	test(`${operation.name} rejects server errors even with fail-open enabled`, async () => {
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
				failOpen: true,
				retryConfig: { strategy: "none" },
			});
			await expect(operation.call(client)).rejects.toMatchObject({
				statusCode: 503,
			});
			expect(requests).toBe(1);
		} finally {
			await server.stop(true);
		}
	});
}
