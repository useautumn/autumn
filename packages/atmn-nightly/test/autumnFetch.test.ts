/**
 * Every request the CLI makes carries `atmn/<version> (...)` as its user
 * agent, so server logs can tell CLI traffic (and which build) apart.
 */

import { expect, test } from "bun:test";
import { createClient } from "../src/generated/client";
import { USER_AGENT, withUserAgent } from "../src/http/autumnFetch";
import { version } from "../src/version";

type Captured = { url: string; headers: Headers };

const capturingFetch = (): {
	fetch: typeof globalThis.fetch;
	calls: Captured[];
} => {
	const calls: Captured[] = [];
	const fetch = Object.assign(
		async (
			input: Parameters<typeof globalThis.fetch>[0],
			init?: Parameters<typeof globalThis.fetch>[1],
		) => {
			calls.push({ url: String(input), headers: new Headers(init?.headers) });
			return new Response("{}", {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		},
		globalThis.fetch,
	);
	return { fetch, calls };
};

test("the user agent names the CLI and its version", () => {
	expect(USER_AGENT).toMatch(/^atmn\/\S+ \(\w+; (bun|node) [\d.]+\)$/);
	expect(USER_AGENT).toContain(`atmn/${version}`);
});

test("withUserAgent stamps the header and keeps the caller's headers", async () => {
	const { fetch, calls } = capturingFetch();
	await withUserAgent(fetch)("https://example.test/x", {
		headers: { authorization: "Bearer k" },
	});
	expect(calls[0]?.headers.get("user-agent")).toBe(USER_AGENT);
	expect(calls[0]?.headers.get("authorization")).toBe("Bearer k");
});

test("withUserAgent leaves a caller-set user agent alone", async () => {
	const { fetch, calls } = capturingFetch();
	await withUserAgent(fetch)("https://example.test/x", {
		headers: { "user-agent": "custom/1" },
	});
	expect(calls[0]?.headers.get("user-agent")).toBe("custom/1");
});

test("the generated client sends it when given the transport", async () => {
	const { fetch, calls } = capturingFetch();
	const client = createClient({
		secretKey: "am_sk_test_x",
		baseUrl: "https://example.test",
		fetch: withUserAgent(fetch),
	});
	await client.get({});
	expect(calls[0]?.url).toBe("https://example.test/v1/catalogV2.get");
	expect(calls[0]?.headers.get("user-agent")).toBe(USER_AGENT);
});
