/**
 * The client is generated so it cannot drift from the API the way v2's
 * hand-rolled fetchers did. These assert the parts that would drift: the paths,
 * the auth header, that a failure carries the server's message rather than a
 * bare status, and that responses come back in fixture casing.
 *
 * `fetch` is injected — none of this touches the network.
 */

import { expect, test } from "bun:test";
import { AutumnApiError, createClient } from "../src/generated/client";

const capturingFetch = ({
	status = 200,
	body = {},
}: {
	status?: number;
	body?: unknown;
} = {}) => {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetch = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof globalThis.fetch;
	return { fetch, calls };
};

test("posts to the path the spec declares, with bearer auth", async () => {
	const { fetch, calls } = capturingFetch();
	const client = createClient({ secretKey: "sk_test", fetch });

	await client.update({ features: [], skip_deletions: false });

	expect(calls).toHaveLength(1);
	expect(calls[0].url).toBe("https://api.useautumn.com/v1/catalogV2.update");
	expect(calls[0].init.method).toBe("POST");
	expect((calls[0].init.headers as Record<string, string>).authorization).toBe(
		"Bearer sk_test",
	);
	expect(JSON.parse(calls[0].init.body as string)).toEqual({
		features: [],
		skip_deletions: false,
	});
});

test("preview and update take the same body and differ only by path", async () => {
	// preview ≡ update is the invariant the whole design rests on: if these ever
	// took different params, a clean preview would stop meaning anything.
	const { fetch, calls } = capturingFetch();
	const client = createClient({ secretKey: "sk_test", fetch });
	const body = { features: [], skip_deletions: false };

	await client.previewUpdate(body);
	await client.update(body);

	expect(calls[0].url).toEndWith("/v1/catalogV2.preview_update");
	expect(calls[1].url).toEndWith("/v1/catalogV2.update");
	expect(calls[0].init.body).toBe(calls[1].init.body);
});

test("baseUrl is overridable for sandboxes and local servers", async () => {
	const { fetch, calls } = capturingFetch();
	const client = createClient({
		secretKey: "sk_test",
		baseUrl: "http://localhost:8080",
		fetch,
	});

	await client.get({});
	expect(calls[0].url).toBe("http://localhost:8080/v1/catalogV2.get");
});

test("a failure surfaces the server's message, not just a status", async () => {
	const { fetch } = capturingFetch({
		status: 400,
		body: {
			message: "skip_deletions: false with no features would remove all 3",
		},
	});
	const client = createClient({ secretKey: "sk_test", fetch });

	const failure = client.update({ features: [] });
	await expect(failure).rejects.toThrow(AutumnApiError);
	// The message is what a user acts on; a bare 400 tells them nothing.
	await expect(failure).rejects.toThrow(/would remove all 3/);
});

test("responses come back in fixture casing", async () => {
	const { fetch } = capturingFetch({
		body: { plans: [{ plan_id: "pro", version_slug: "v2" }] },
	});
	const client = createClient({ secretKey: "sk_test", fetch });

	// biome-ignore lint/suspicious/noExplicitAny: asserting on a dynamic response
	const response = (await client.get({})) as any;
	expect(response.plans[0].planId).toBe("pro");
	expect(response.plans[0].versionSlug).toBe("v2");
});
