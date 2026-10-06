import { afterAll, describe, expect, test } from "bun:test";
import billingPackageJson from "../../../package.json";
import { createAutumnClient } from "../../../src/external/autumn/createAutumnClient";

const requests: { path: string; body: unknown; auth: string | null }[] = [];

const fakeAutumn = Bun.serve({
	port: 0,
	fetch: async (req) => {
		requests.push({
			path: new URL(req.url).pathname,
			body: await req.json(),
			auth: req.headers.get("authorization"),
		});
		return Response.json({ success: true });
	},
});

afterAll(() => fakeAutumn.stop(true));

describe("createAutumnClient", () => {
	test("refuses a live key unless explicitly allowed", () => {
		expect(() =>
			createAutumnClient({ config: { secretKey: "am_sk_live_abc" } }),
		).toThrow(/sandbox/);
		expect(() =>
			createAutumnClient({ config: { secretKey: "am_sk_test_abc" } }),
		).not.toThrow();
		expect(() =>
			createAutumnClient({
				config: { secretKey: "am_sk_live_abc", allowLiveKey: true },
			}),
		).not.toThrow();
	});

	test("uses the exact npm autumn-js pin, not workspace source", async () => {
		const resolved = Bun.resolveSync(
			"autumn-js",
			`${import.meta.dir}/../../../src`,
		);
		const installed = await Bun.file(
			Bun.resolveSync(
				"autumn-js/package.json",
				`${import.meta.dir}/../../../src`,
			),
		).json();

		expect(resolved).toContain("/node_modules/");
		expect(resolved).not.toContain("/packages/autumn-js/src/");
		expect(installed.version).toBe(
			billingPackageJson.dependencies["autumn-js"],
		);
	});

	test("batchTrack posts track items to the configured server", async () => {
		const client = createAutumnClient({
			config: {
				secretKey: "am_sk_test_abc",
				serverUrl: `http://localhost:${fakeAutumn.port}`,
			},
		});

		const result = await client.batchTrack({
			items: [
				{
					customerId: "org_1",
					featureId: "api_calls",
					value: 3,
					timestampMs: 1_700_000_000_000,
					idempotencyKey: "org_1:api_calls:1",
					properties: { source: "test" },
				},
			],
		});

		expect(result).toEqual({ accepted: 1 });
		const request = requests.at(-1);
		expect(request?.path).toContain("batch");
		expect(request?.auth).toBe("Bearer am_sk_test_abc");
		expect(JSON.stringify(request?.body)).toContain('"customer_id":"org_1"');
	});
});
