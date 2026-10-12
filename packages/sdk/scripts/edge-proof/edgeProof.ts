/**
 * Proves `edgeURL`, `autumn.edge.check` and `useEdge` on a packed autumn-js, against local stand-ins and a real edge.
 * Run: packages/sdk/scripts/edge-proof/README.md.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Autumn, HTTPClient } from "autumn-js";

const STAGING_API_URL = "https://api-staging.useautumn.com";

type Reply = { status: number; body: unknown; delayMs?: number };
type Stand = { url: string; hits: () => number; close: () => void };

const results: { name: string; ok: boolean; detail: string }[] = [];

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A local server answering every request with `reply`, counting what it was sent. */
const startStand = async ({
	reply,
}: {
	reply: () => Reply;
}): Promise<Stand> => {
	let hits = 0;
	const server: Server = createServer(async (request, response) => {
		hits++;
		request.resume();
		const { status, body, delayMs } = reply();
		if (delayMs) await sleep(delayMs);
		response.writeHead(status, { "content-type": "application/json" });
		response.end(JSON.stringify(body));
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		hits: () => hits,
		close: () => {
			server.closeAllConnections();
			server.close();
		},
	};
};

/** A port nothing listens on. */
const deadURL = async () => {
	const stand = await startStand({ reply: () => ({ status: 200, body: {} }) });
	stand.close();
	return stand.url;
};

const checkBody = (customerId: string) => ({
	allowed: true,
	customer_id: customerId,
	balance: null,
	flag: null,
});

const CHECK = { customerId: "cus_proof", featureId: "messages" };

const record = async (name: string, run: () => Promise<string>) => {
	try {
		results.push({ name, ok: true, detail: await run() });
	} catch (error) {
		results.push({ name, ok: false, detail: String(error) });
	}
};

/** Every reply's host and status, in order. Needs `failOpen: false`: fail-open swaps the HTTP client. */
const tracedClient = () => {
	const replies: string[] = [];
	const httpClient = new HTTPClient();
	httpClient.addHook("response", (response, request) => {
		const forwarded = response.headers.get("x-atom-forwarded");
		replies.push(
			`${new URL(request.url).host} ${response.status}${forwarded ? ` forwarded=${forwarded}` : ""}`,
		);
	});
	return { httpClient, replies };
};

const hostsOf = (replies: string[]) =>
	replies.map((reply) => reply.split(" ")[0]);

const runLocal = async () => {
	const autumn = await startStand({
		reply: () => ({ status: 200, body: checkBody("from_autumn") }),
	});
	const base = {
		secretKey: "am_sk_test_proof",
		serverURL: autumn.url,
		retryConfig: { strategy: "none" as const },
	};

	await record(
		"(a) local: autumn.edge.check answered by the edge",
		async () => {
			const edge = await startStand({
				reply: () => ({ status: 200, body: checkBody("from_edge") }),
			});
			const before = autumn.hits();
			const response = await new Autumn({
				...base,
				edgeURL: edge.url,
			}).edge.check(CHECK);
			edge.close();
			assert.equal(response.customerId, "from_edge");
			assert.equal(autumn.hits(), before);
			return `customerId=${response.customerId}, Autumn hits +0`;
		},
	);

	await record("(b) local: dead edgeURL falls back, same shape", async () => {
		const response = await new Autumn({
			...base,
			edgeURL: await deadURL(),
		}).edge.check(CHECK);
		assert.equal(response.customerId, "from_autumn");
		assert.deepEqual(Object.keys(response).sort(), [
			"allowed",
			"balance",
			"customerId",
			"flag",
		]);
		return `customerId=${response.customerId}, keys=${Object.keys(response).sort().join(",")}`;
	});

	await record("(c) local: edge 4xx does not fall back", async () => {
		const edge = await startStand({
			reply: () => ({
				status: 400,
				body: { message: "Bad body", code: "invalid_request" },
			}),
		});
		const before = autumn.hits();
		await assert.rejects(
			new Autumn({ ...base, edgeURL: edge.url }).edge.check(CHECK),
			{ statusCode: 400 },
		);
		edge.close();
		assert.equal(autumn.hits(), before);
		return "rejected 400, Autumn hits +0";
	});

	await record(
		"(d) local: a slow edge falls back within the call",
		async () => {
			const edge = await startStand({
				reply: () => ({
					status: 200,
					body: checkBody("from_edge"),
					delayMs: 3_000,
				}),
			});
			const startedAt = Date.now();
			const response = await new Autumn({
				...base,
				edgeURL: edge.url,
			}).edge.check(CHECK);
			const tookMs = Date.now() - startedAt;
			edge.close();
			assert.equal(response.customerId, "from_autumn");
			assert.ok(tookMs < 2_000, `took ${tookMs}ms`);
			return `fell back after ${tookMs}ms (the edge would take 3000ms)`;
		},
	);

	await record("(d) local: timeoutMs bounds the whole call", async () => {
		const edge = await startStand({
			reply: () => ({
				status: 200,
				body: checkBody("from_edge"),
				delayMs: 3_000,
			}),
		});
		const startedAt = Date.now();
		await assert.rejects(
			new Autumn({
				...base,
				edgeURL: edge.url,
				failOpen: false,
				timeoutMs: 200,
			}).edge.check(CHECK),
			{ name: "RequestTimeoutError" },
		);
		const tookMs = Date.now() - startedAt;
		edge.close();
		assert.ok(tookMs < 1_000, `took ${tookMs}ms`);
		return `RequestTimeoutError after ${tookMs}ms`;
	});

	await record("(e) local: no edgeURL goes straight to Autumn", async () => {
		const before = autumn.hits();
		const response = await new Autumn(base).edge.check(CHECK);
		assert.equal(response.customerId, "from_autumn");
		assert.equal(autumn.hits(), before + 1);
		return "Autumn hits +1";
	});

	await record(
		"(g) local: useEdge routes autumn.check, off it doesn't",
		async () => {
			const edge = await startStand({
				reply: () => ({ status: 200, body: checkBody("from_edge") }),
			});
			const on = await new Autumn({
				...base,
				edgeURL: edge.url,
				useEdge: true,
			}).check(CHECK);
			const off = await new Autumn({ ...base, edgeURL: edge.url }).check(CHECK);
			edge.close();
			assert.equal(on.customerId, "from_edge");
			assert.equal(off.customerId, "from_autumn");
			return `useEdge on: ${on.customerId}; off: ${off.customerId}`;
		},
	);

	autumn.close();
};

/** Read-only checks against a real edge and api-staging; the valid-key ones need a key, customer and feature. */
const runStaging = async ({
	edgeURL,
	secretKey,
	customerId,
	featureId,
}: {
	edgeURL: string;
	secretKey: string | undefined;
	customerId: string | undefined;
	featureId: string | undefined;
}) => {
	const edgeHost = new URL(edgeURL).host;

	await record(
		"(c) staging: an unknown key's 401 does not fall back",
		async () => {
			const autumn = await startStand({
				reply: () => ({ status: 200, body: checkBody("from_local_autumn") }),
			});
			const { httpClient, replies } = tracedClient();
			await assert.rejects(
				new Autumn({
					secretKey: "am_sk_test_unknown",
					serverURL: autumn.url,
					edgeURL,
					failOpen: false,
					httpClient,
				}).edge.check(CHECK),
				{ statusCode: 401 },
			);
			autumn.close();
			assert.equal(autumn.hits(), 0);
			return `replies: ${replies.join(" | ")}; local Autumn hits 0`;
		},
	);

	if (!secretKey || !customerId || !featureId) return;
	const check = { customerId, featureId };
	const options = {
		secretKey,
		serverURL: STAGING_API_URL,
		failOpen: false,
	};

	await record(
		"(a) staging: autumn.edge.check answered by the edge",
		async () => {
			const { httpClient, replies } = tracedClient();
			const response = await new Autumn({
				...options,
				edgeURL,
				httpClient,
			}).edge.check(check);
			assert.deepEqual(replies, [`${edgeHost} 200`]);
			return `replies: ${replies.join(" | ")}; allowed=${response.allowed}`;
		},
	);

	await record(
		"(g) staging: useEdge routes autumn.check to the edge",
		async () => {
			const { httpClient, replies } = tracedClient();
			const response = await new Autumn({
				...options,
				edgeURL,
				useEdge: true,
				httpClient,
			}).check(check);
			assert.deepEqual(replies, [`${edgeHost} 200`]);
			return `replies: ${replies.join(" | ")}; allowed=${response.allowed}`;
		},
	);

	await record(
		"(b) staging: dead edgeURL, same shape from Autumn",
		async () => {
			const viaEdge = await new Autumn({ ...options, edgeURL }).edge.check(
				check,
			);
			const { httpClient, replies } = tracedClient();
			const viaFallback = await new Autumn({
				...options,
				edgeURL: await deadURL(),
				httpClient,
			}).edge.check(check);
			assert.deepEqual(
				Object.keys(viaFallback).sort(),
				Object.keys(viaEdge).sort(),
			);
			assert.equal(viaFallback.customerId, customerId);
			assert.deepEqual(hostsOf(replies), ["api-staging.useautumn.com"]);
			return `replies: ${replies.join(" | ")}; keys match, customerId=${viaFallback.customerId}`;
		},
	);

	await record(
		"(e) staging: no edgeURL goes straight to api-staging",
		async () => {
			const { httpClient, replies } = tracedClient();
			await new Autumn({ ...options, httpClient }).edge.check(check);
			assert.deepEqual(hostsOf(replies), ["api-staging.useautumn.com"]);
			return `replies: ${replies.join(" | ")}`;
		},
	);
};

await runLocal();
const { EDGE_URL, STAGING_SECRET_KEY, CUSTOMER_ID, FEATURE_ID } = process.env;
if (EDGE_URL)
	await runStaging({
		edgeURL: EDGE_URL,
		secretKey: STAGING_SECRET_KEY,
		customerId: CUSTOMER_ID,
		featureId: FEATURE_ID,
	});
else console.log("EDGE_URL unset: skipped the staging checks");

for (const { name, ok, detail } of results)
	console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
process.exitCode = results.every(({ ok }) => ok) ? 0 : 1;
