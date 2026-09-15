/**
 * `atmn api` is a thin wrapper over the public spec: the only things that
 * can go wrong are the body it builds and the request it sends, so these
 * pin both without touching the network.
 */

import { expect, test } from "bun:test";
import {
	buildApiBody,
	buildApiRequest,
	callApi,
	findApiRoute,
	parseFieldArgs,
	parseHeaderArgs,
	renderCurl,
} from "../src/actions/api/callApi";
import { summarize } from "../src/actions/api/registerApiCommands";
import { API_ROUTES, API_VERSION } from "../src/generated/apiRoutes";
import { AutumnApiError } from "../src/generated/client";

const check = findApiRoute({ group: "balances", method: "check" });
if (check === undefined) throw new Error("balances.check is not in the spec");

test("every route is an RPC path under its group and method", () => {
	expect(API_ROUTES.length).toBeGreaterThan(50);
	for (const route of API_ROUTES) {
		expect(route.path).toBe(`/v1/${route.group}.${route.method}`);
	}
	// Internal routes never reach the public spec, so they never become commands.
	expect(
		findApiRoute({ group: "catalogV2", method: "update" }),
	).toBeUndefined();
	expect(
		findApiRoute({ group: "organization", method: "update" }),
	).toBeUndefined();
});

test("key=value pairs are coerced by the field's spec type", async () => {
	const body = await buildApiBody({
		route: check,
		fields: parseFieldArgs({
			args: [
				"customer_id=cus_1",
				"feature_id=messages",
				"required_balance=3",
				"send_event=true",
				'properties={"model":"gpt-4"}',
			],
		}),
	});
	expect(body).toEqual({
		customer_id: "cus_1",
		feature_id: "messages",
		required_balance: 3,
		send_event: true,
		properties: { model: "gpt-4" },
	});
});

test("--body is the document and key=value overrides one field of it", async () => {
	const body = await buildApiBody({
		route: check,
		body: '{"customer_id":"cus_1","feature_id":"a"}',
		fields: { feature_id: "b" },
	});
	expect(body).toEqual({ customer_id: "cus_1", feature_id: "b" });
});

test("--body - reads stdin", async () => {
	const body = await buildApiBody({
		route: check,
		body: "-",
		readStdin: async () => '{"customer_id":"from_stdin"}',
	});
	expect(body).toEqual({ customer_id: "from_stdin" });
});

test("a field the spec does not have, or a value of the wrong type, is refused", async () => {
	await expect(
		buildApiBody({ route: check, fields: { nope: "1" } }),
	).rejects.toThrow("has no field nope");
	await expect(
		buildApiBody({ route: check, fields: { required_balance: "many" } }),
	).rejects.toThrow("takes a number");
	await expect(
		buildApiBody({ route: check, fields: { send_event: "yes" } }),
	).rejects.toThrow("takes true or false");
	expect(() => parseFieldArgs({ args: ["customer_id"] })).toThrow(
		"Expected key=value",
	);
});

test("an array-bodied route takes --body only", async () => {
	const batch = findApiRoute({ group: "balances", method: "batch_track" });
	if (batch === undefined)
		throw new Error("balances.batch_track is not in the spec");
	expect(batch.body).toBe("array");
	await expect(
		buildApiBody({ route: batch, fields: { customer_id: "x" } }),
	).rejects.toThrow("array body");
	expect(
		await buildApiBody({ route: batch, body: '[{"customer_id":"x"}]' }),
	).toEqual([{ customer_id: "x" }]);
});

test("the request carries bearer auth and the spec's api version", async () => {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetch = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(JSON.stringify({ allowed: true }), { status: 200 });
	}) as unknown as typeof globalThis.fetch;

	const response = await callApi({
		route: check,
		baseUrl: "http://localhost:8080",
		secretKey: "sk_test",
		fields: { customer_id: "cus_1", feature_id: "messages" },
		fetch,
	});

	expect(response).toEqual({ allowed: true });
	expect(calls[0]?.url).toBe("http://localhost:8080/v1/balances.check");
	const headers = calls[0]?.init.headers as Record<string, string>;
	expect(headers.authorization).toBe("Bearer sk_test");
	expect(headers["x-api-version"]).toBe(API_VERSION);
	expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
		customer_id: "cus_1",
		feature_id: "messages",
	});
});

test("a failure surfaces the server's message", async () => {
	const fetch = (async () =>
		new Response(JSON.stringify({ message: "no such customer" }), {
			status: 404,
		})) as unknown as typeof globalThis.fetch;
	await expect(
		callApi({
			route: check,
			baseUrl: "http://localhost:8080",
			secretKey: "sk_test",
			fields: { customer_id: "cus_1" },
			fetch,
		}),
	).rejects.toThrow(AutumnApiError);
});

test("-H adds a header and can override the api version", async () => {
	const request = await buildApiRequest({
		route: check,
		baseUrl: "https://api.useautumn.com",
		secretKey: "sk",
		headers: ["Idempotency-Key: abc", "X-Api-Version: 2.3.0"],
	});
	expect(request.headers["idempotency-key"]).toBe("abc");
	expect(request.headers["x-api-version"]).toBe("2.3.0");
	expect(() => parseHeaderArgs({ headers: ["nocolon"] })).toThrow(
		'Expected -H "name: value"',
	);
});

test("--curl prints the request with the key's env var in place of the key", async () => {
	const request = await buildApiRequest({
		route: check,
		baseUrl: "https://api.useautumn.com",
		secretKey: "sk_secret",
		fields: { customer_id: "it's" },
	});
	const curl = renderCurl({ request, secretKeyName: "AUTUMN_PROD_SECRET_KEY" });
	expect(curl).not.toContain("sk_secret");
	// Double-quoted so a shell expands the variable; single quotes would send it literally.
	expect(curl).toContain('-H "authorization: Bearer $AUTUMN_PROD_SECRET_KEY"');
	expect(curl).toContain("'https://api.useautumn.com/v1/balances.check'");
	expect(curl).toContain(`-d '{"customer_id":"it'\\''s"}'`);
});

test("the group listing shows one clipped sentence per route", () => {
	expect(summarize({ text: "Short one. Then more." })).toBe("Short one.");
	expect(summarize({ text: "Costs $1.50 per unit. Next." })).toBe(
		"Costs $1.50 per unit.",
	);
	const long = `${"word ".repeat(30)}end. Second sentence.`;
	const clipped = summarize({ text: long });
	expect(clipped.length).toBeLessThanOrEqual(80);
	expect(clipped).toEndWith("…");
});
