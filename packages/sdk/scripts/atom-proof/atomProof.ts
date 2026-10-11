/**
 * Proves `atomURL` + `autumn.atom.check` on a packed autumn-js, against local stand-ins and, with secrets, real staging.
 * Run: packages/sdk/scripts/atom-proof/README.md.
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Autumn, HTTPClient } from "autumn-js";

const STAGING_API_URL = "https://api-staging.useautumn.com";
const STAGING_ATOM_URL =
	process.env.ATOM_URL ?? "https://api.0kryvu.vpc.direct";

type Reply = { status: number; body: unknown; delayMs?: number };
type Stand = { url: string; hits: () => number; close: () => void };

const results: { name: string; ok: boolean; detail: string }[] = [];

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A local server answering every request with `reply`, counting what it was sent. */
const startStand = async ({
	reply,
}: {
	reply: (hit: number) => Reply;
}): Promise<Stand> => {
	let hits = 0;
	const server: Server = createServer(async (request, response) => {
		hits++;
		request.resume();
		const { status, body, delayMs } = reply(hits);
		if (delayMs) await sleep(delayMs);
		response.writeHead(status, { "content-type": "application/json" });
		response.end(JSON.stringify(body));
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}`,
		hits: () => hits,
		close: () => server.close(),
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

/** Every reply's status and `x-atom-forwarded`, in order: the SDK returns only the body. */
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

const runLocal = async () => {
	const autumn = await startStand({
		reply: () => ({ status: 200, body: checkBody("from_autumn") }),
	});
	const base = {
		secretKey: "am_sk_test_proof",
		serverURL: autumn.url,
		retryConfig: { strategy: "none" as const },
	};

	await record("(a) local: answered by Atom", async () => {
		const atom = await startStand({
			reply: () => ({ status: 200, body: checkBody("from_atom") }),
		});
		const before = autumn.hits();
		const response = await new Autumn({
			...base,
			atomURL: atom.url,
		}).atom.check(CHECK);
		atom.close();
		assert.equal(response.customerId, "from_atom");
		assert.equal(autumn.hits(), before);
		return `customerId=${response.customerId}, Autumn hits +0`;
	});

	await record("(b) local: dead atomURL falls back, same shape", async () => {
		const response = await new Autumn({
			...base,
			atomURL: await deadURL(),
		}).atom.check(CHECK);
		assert.equal(response.customerId, "from_autumn");
		assert.deepEqual(Object.keys(response).sort(), [
			"allowed",
			"balance",
			"customerId",
			"flag",
		]);
		return `customerId=${response.customerId}, keys=${Object.keys(response).sort().join(",")}`;
	});

	await record("(c) local: Atom 4xx does not fall back", async () => {
		const atom = await startStand({
			reply: () => ({
				status: 400,
				body: { message: "Bad body", code: "invalid_request" },
			}),
		});
		const before = autumn.hits();
		await assert.rejects(
			new Autumn({ ...base, atomURL: atom.url }).atom.check(CHECK),
			{ statusCode: 400 },
		);
		atom.close();
		assert.equal(autumn.hits(), before);
		return "rejected 400, Autumn hits +0";
	});

	await record("(d) local: timeoutMs bounds the Atom call", async () => {
		const atom = await startStand({
			reply: () => ({
				status: 200,
				body: checkBody("from_atom"),
				delayMs: 2_000,
			}),
		});
		const startedAt = Date.now();
		const response = await new Autumn({
			...base,
			atomURL: atom.url,
			timeoutMs: 200,
		}).atom.check(CHECK);
		const tookMs = Date.now() - startedAt;
		atom.close();
		assert.equal(response.customerId, "from_autumn");
		assert.ok(tookMs < 1_000, `took ${tookMs}ms`);
		return `fell back after ${tookMs}ms (Atom would take 2000ms)`;
	});

	await record("(d) local: retries hit Atom before falling back", async () => {
		const atom = await startStand({
			reply: () => ({ status: 503, body: { code: "atom_unavailable" } }),
		});
		const response = await new Autumn({
			...base,
			atomURL: atom.url,
			retryConfig: {
				strategy: "backoff",
				backoff: {
					initialInterval: 10,
					maxInterval: 20,
					exponent: 1,
					maxElapsedTime: 100,
				},
			},
		}).atom.check(CHECK);
		const attempts = atom.hits();
		atom.close();
		assert.ok(attempts > 1, `attempts=${attempts}`);
		assert.equal(response.customerId, "from_autumn");
		return `Atom attempts=${attempts}, then Autumn answered`;
	});

	await record("(e) local: no atomURL goes straight to Autumn", async () => {
		const before = autumn.hits();
		const response = await new Autumn(base).atom.check(CHECK);
		assert.equal(response.customerId, "from_autumn");
		assert.equal(autumn.hits(), before + 1);
		return "Autumn hits +1";
	});

	autumn.close();
};

const runStagingWithoutSecrets = async () => {
	const autumn = await startStand({
		reply: () => ({ status: 200, body: checkBody("from_local_autumn") }),
	});

	await record("(c) staging: shadow Atom 401 does not fall back", async () => {
		const { httpClient, replies } = tracedClient();
		await assert.rejects(
			new Autumn({
				secretKey: "am_sk_test_unknown",
				serverURL: autumn.url,
				atomURL: STAGING_ATOM_URL,
				failOpen: false,
				httpClient,
			}).atom.check(CHECK),
			{ statusCode: 401 },
		);
		assert.equal(autumn.hits(), 0);
		return `replies: ${replies.join(" | ")}; local Autumn hits 0`;
	});

	// Each leg gets the timeout: long enough for the local Autumn, too short for a TLS round trip to the Atom.
	await record(
		"(d) staging: timeoutMs on the real Atom falls back",
		async () => {
			const { httpClient, replies } = tracedClient();
			const response = await new Autumn({
				secretKey: "am_sk_test_unknown",
				serverURL: autumn.url,
				atomURL: STAGING_ATOM_URL,
				failOpen: false,
				httpClient,
				timeoutMs: 20,
			}).atom.check(CHECK);
			assert.equal(response.customerId, "from_local_autumn");
			assert.equal(autumn.hits(), 1);
			return `replies: ${replies.join(" | ")} (no Atom reply within 20ms); customerId=${response.customerId}`;
		},
	);

	await record("(b) staging: dead atomURL reaches api-staging", async () => {
		const { httpClient, replies } = tracedClient();
		await assert.rejects(
			new Autumn({
				secretKey: "am_sk_test_unknown",
				serverURL: STAGING_API_URL,
				atomURL: await deadURL(),
				failOpen: false,
				httpClient,
			}).atom.check(CHECK),
			{ statusCode: 401 },
		);
		assert.ok(
			replies.some((reply) => reply.startsWith("api-staging.useautumn.com")),
		);
		return `replies: ${replies.join(" | ")} (an unknown key: Autumn's own 401)`;
	});

	autumn.close();
};

/** Needs a staging secret key and, for our multi-tenant shadow Atom, the org's Atom token. */
const runStagingWithSecrets = async ({
	secretKey,
	atomToken,
	customerId,
	featureId,
}: {
	secretKey: string;
	atomToken: string | undefined;
	customerId: string;
	featureId: string;
}) => {
	const check = { customerId, featureId };
	const headers = atomToken ? { "x-atom-token": atomToken } : undefined;

	await record("(a) staging: answered by the shadow Atom", async () => {
		const { httpClient, replies } = tracedClient();
		const response = await new Autumn({
			secretKey,
			serverURL: STAGING_API_URL,
			atomURL: STAGING_ATOM_URL,
			failOpen: false,
			httpClient,
		}).atom.check(check, { headers });
		assert.equal(replies.length, 1);
		assert.match(replies[0] ?? "", /^api\.0kryvu\.vpc\.direct 200$/);
		return `replies: ${replies.join(" | ")}; allowed=${response.allowed}`;
	});

	await record(
		"(b) staging: dead atomURL, same shape from Autumn",
		async () => {
			const viaAtom = await new Autumn({
				secretKey,
				serverURL: STAGING_API_URL,
				atomURL: STAGING_ATOM_URL,
			}).atom.check(check, { headers });
			const { httpClient, replies } = tracedClient();
			const viaFallback = await new Autumn({
				secretKey,
				serverURL: STAGING_API_URL,
				atomURL: await deadURL(),
				httpClient,
			}).atom.check(check);
			assert.deepEqual(
				Object.keys(viaFallback).sort(),
				Object.keys(viaAtom).sort(),
			);
			return `replies: ${replies.join(" | ")}; keys match`;
		},
	);

	await record(
		"(e) staging: no atomURL goes straight to api-staging",
		async () => {
			const { httpClient, replies } = tracedClient();
			await new Autumn({
				secretKey,
				serverURL: STAGING_API_URL,
				httpClient,
			}).atom.check(check);
			assert.deepEqual(
				replies.map((reply) => reply.split(" ")[0]),
				["api-staging.useautumn.com"],
			);
			return `replies: ${replies.join(" | ")}`;
		},
	);
};

await runLocal();
await runStagingWithoutSecrets();
const { STAGING_SECRET_KEY, ATOM_TOKEN, CUSTOMER_ID, FEATURE_ID } = process.env;
if (STAGING_SECRET_KEY && CUSTOMER_ID && FEATURE_ID)
	await runStagingWithSecrets({
		secretKey: STAGING_SECRET_KEY,
		atomToken: ATOM_TOKEN,
		customerId: CUSTOMER_ID,
		featureId: FEATURE_ID,
	});
else
	console.log(
		"STAGING_SECRET_KEY/CUSTOMER_ID/FEATURE_ID unset: skipped the staging-with-secrets checks",
	);

for (const { name, ok, detail } of results)
	console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
process.exitCode = results.every(({ ok }) => ok) ? 0 : 1;
