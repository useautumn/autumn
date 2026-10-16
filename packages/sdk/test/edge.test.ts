import { afterEach, expect, test } from "bun:test";
import type { EdgeSDKOptions } from "../src/hooks/edge/types/edgeSDKOptions.js";
import type { CheckParams } from "../src/models/index.js";
import { Autumn } from "../src/sdk/sdk.js";

/** What a stub was sent, copied: Bun recycles a `Request` once its handler returns. */
type SentRequest = { url: string; headers: Headers };

type Stub = { url: string; requests: SentRequest[] };

const servers: { stop: (force: boolean) => Promise<void> }[] = [];

afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.stop(true)));
});

const checkAnswer = ({ customerId }: { customerId: string }) => ({
	allowed: true,
	customer_id: customerId,
	balance: null,
	flag: null,
});

/** A server answering every request with `reply`, keeping what it was sent. */
const startStub = ({
	reply,
}: {
	reply: (request: Request) => Response | Promise<Response>;
}): Stub => {
	const requests: SentRequest[] = [];
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch(request) {
			requests.push({
				url: request.url,
				headers: new Headers(request.headers),
			});
			return reply(request);
		},
	});
	servers.push(server);
	return { url: `http://127.0.0.1:${server.port}`, requests };
};

const startAutumn = () =>
	startStub({
		reply: () => Response.json(checkAnswer({ customerId: "from_autumn" })),
	});

const startEdge = () =>
	startStub({
		reply: () => Response.json(checkAnswer({ customerId: "from_edge" })),
	});

/** A port nothing listens on: connecting is refused. */
const closedURL = async () => {
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: () => new Response(),
	});
	const url = `http://127.0.0.1:${server.port}`;
	await server.stop(true);
	return url;
};

const clientFor = ({
	autumnURL,
	...options
}: { autumnURL: string } & EdgeSDKOptions): Autumn =>
	new Autumn({
		secretKey: "am_sk_test",
		serverURL: autumnURL,
		retryConfig: { strategy: "none" },
		...options,
	});

/** What `autumn.edge` is: the same client with `useEdge` on (.speakeasy/patches). */
const edgeClientFor = (options: { autumnURL: string } & EdgeSDKOptions) =>
	clientFor({ ...options, useEdge: true });

const CHECK = { customerId: "customer_123", featureId: "messages" };

const EDGE_DOWN_REPLIES = [
	{
		name: "503 atom_unavailable (owner thread shed or restarting)",
		reply: () =>
			Response.json(
				{ message: "Atom thread 1 is unavailable", code: "atom_unavailable" },
				{ status: 503 },
			),
	},
	{
		name: "500 internal_error (the edge could not answer)",
		reply: () =>
			Response.json(
				{ message: "Atom could not answer", code: "internal_error" },
				{ status: 500 },
			),
	},
	{
		name: "502 from a proxy in front of the edge",
		reply: () => new Response("Bad Gateway", { status: 502 }),
	},
	{
		name: "504 from a proxy in front of the edge",
		reply: () => new Response("Gateway Timeout", { status: 504 }),
	},
];

for (const failOpen of [true, false]) {
	for (const down of EDGE_DOWN_REPLIES) {
		test(`falls back to Autumn on ${down.name} (failOpen: ${failOpen})`, async () => {
			const edge = startStub({ reply: down.reply });
			const autumn = startAutumn();

			const response = await edgeClientFor({
				edgeURL: edge.url,
				autumnURL: autumn.url,
				failOpen,
			}).check(CHECK);

			expect(response.customerId).toBe("from_autumn");
			expect(edge.requests).toHaveLength(1);
			expect(autumn.requests).toHaveLength(1);
		});
	}

	test(`falls back to Autumn when the edge refuses the connection (failOpen: ${failOpen})`, async () => {
		const autumn = startAutumn();

		const response = await edgeClientFor({
			edgeURL: await closedURL(),
			autumnURL: autumn.url,
			failOpen,
		}).check(CHECK);

		expect(response.customerId).toBe("from_autumn");
		expect(autumn.requests).toHaveLength(1);
	});

	test(`falls back to Autumn when the edge is slower than its 1s budget (failOpen: ${failOpen})`, async () => {
		const edge = startStub({
			reply: async () => {
				await Bun.sleep(2_000);
				return Response.json(checkAnswer({ customerId: "from_edge" }));
			},
		});
		const autumn = startAutumn();
		const startedAt = Date.now();

		const response = await edgeClientFor({
			edgeURL: edge.url,
			autumnURL: autumn.url,
			failOpen,
		}).check(CHECK);

		expect(response.customerId).toBe("from_autumn");
		expect(Date.now() - startedAt).toBeLessThan(1_800);
	});
}

test("the edge's own answer is returned without asking Autumn", async () => {
	const edge = startEdge();
	const autumn = startAutumn();

	const response = await edgeClientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
	}).check(CHECK);

	expect(response.customerId).toBe("from_edge");
	expect(edge.requests.map(({ url }) => new URL(url).pathname)).toEqual([
		"/v1/balances.check",
	]);
	expect(autumn.requests).toHaveLength(0);
});

const REAL_ANSWERS = [
	{
		name: "400 invalid_request from the edge",
		status: 400,
		reply: () =>
			Response.json(
				{ message: "Bad body", code: "invalid_request" },
				{ status: 400 },
			),
	},
	{
		name: "401 from the Autumn API, forwarded",
		status: 401,
		reply: () =>
			Response.json(
				{ message: "Invalid secret key", code: "invalid_secret_key" },
				{
					status: 401,
					headers: { "x-atom-forwarded": "secret_key_not_known" },
				},
			),
	},
	{
		name: "503 from the Autumn API, forwarded",
		status: 503,
		reply: () =>
			Response.json(
				{ message: "Down", code: "internal_error" },
				{
					status: 503,
					headers: { "x-atom-forwarded": "customer_not_stored" },
				},
			),
	},
	{
		name: "502 atom_upstream_unreachable (the edge tried the API)",
		status: 502,
		reply: () =>
			Response.json(
				{
					message: "Atom could not reach the Autumn API",
					code: "atom_upstream_unreachable",
				},
				{
					status: 502,
					headers: { "x-atom-forwarded": "customer_not_stored" },
				},
			),
	},
];

for (const answer of REAL_ANSWERS) {
	test(`never falls back on ${answer.name}`, async () => {
		const edge = startStub({ reply: answer.reply });
		const autumn = startAutumn();

		await expect(
			edgeClientFor({
				edgeURL: edge.url,
				autumnURL: autumn.url,
				failOpen: false,
			}).check(CHECK),
		).rejects.toMatchObject({ statusCode: answer.status });
		expect(autumn.requests).toHaveLength(0);
	});
}

test("a forwarded 5xx still fails open like autumn.check, without asking Autumn again", async () => {
	const edge = startStub({
		reply: () =>
			Response.json(
				{ message: "Down" },
				{
					status: 503,
					headers: { "x-atom-forwarded": "customer_not_stored" },
				},
			),
	});
	const autumn = startAutumn();

	const response = await edgeClientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
	}).check(CHECK);

	expect(response).toMatchObject({ allowed: true, balance: null });
	expect(autumn.requests).toHaveLength(0);
});

test("fails open when the edge and Autumn are both down", async () => {
	const edge = startStub({
		reply: () => Response.json({ code: "atom_unavailable" }, { status: 503 }),
	});
	const autumn = startStub({
		reply: () => Response.json({ message: "Down" }, { status: 503 }),
	});

	const response = await edgeClientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
	}).check(CHECK);

	expect(response).toMatchObject({ allowed: true, balance: null });
	expect(autumn.requests).toHaveLength(1);
});

const WRITES: { name: string; request: CheckParams }[] = [
	{ name: "sendEvent", request: { ...CHECK, sendEvent: true } },
	{
		name: "lock",
		request: { ...CHECK, lock: { enabled: true, lockId: "lock_1" } },
	},
];

const keysSent = (stub: Stub) =>
	stub.requests.map(({ headers }) => headers.get("idempotency-key"));

for (const write of WRITES) {
	test(`a check with ${write.name} goes to the edge with a generated idempotency key`, async () => {
		const edge = startEdge();
		const autumn = startAutumn();

		const response = await edgeClientFor({
			edgeURL: edge.url,
			autumnURL: autumn.url,
		}).check(write.request);

		expect(response.customerId).toBe("from_edge");
		expect(autumn.requests).toHaveLength(0);
		const [key] = keysSent(edge);
		expect(key).toMatch(/^[0-9a-f-]{36}$/);
	});

	test(`each check with ${write.name} gets its own key`, async () => {
		const edge = startEdge();
		const client = edgeClientFor({
			edgeURL: edge.url,
			autumnURL: "http://127.0.0.1:1",
		});

		await client.check(write.request);
		await client.check(write.request);

		const [first, second] = keysSent(edge);
		expect(first).toBeString();
		expect(second).toBeString();
		expect(first).not.toBe(second);
	});

	test(`a check with ${write.name} sends the caller's idempotency key unchanged`, async () => {
		const edge = startEdge();
		const autumn = startAutumn();

		await edgeClientFor({ edgeURL: edge.url, autumnURL: autumn.url }).check(
			write.request,
			{ headers: { "Idempotency-Key": "caller_key_1" } },
		);

		expect(keysSent(edge)).toEqual(["caller_key_1"]);
	});

	for (const down of EDGE_DOWN_REPLIES) {
		test(`a check with ${write.name} falls back on ${down.name} with the same key`, async () => {
			const edge = startStub({ reply: down.reply });
			const autumn = startAutumn();

			const response = await edgeClientFor({
				edgeURL: edge.url,
				autumnURL: autumn.url,
				failOpen: false,
			}).check(write.request);

			expect(response.customerId).toBe("from_autumn");
			const [key] = keysSent(edge);
			expect(key).toBeString();
			expect(keysSent(autumn)).toEqual([key]);
		});
	}

	test(`a check with ${write.name} falls back after the edge's 1s budget with the same key`, async () => {
		const edge = startStub({
			reply: async () => {
				await Bun.sleep(2_000);
				return Response.json(checkAnswer({ customerId: "from_edge" }));
			},
		});
		const autumn = startAutumn();

		const response = await edgeClientFor({
			edgeURL: edge.url,
			autumnURL: autumn.url,
			failOpen: false,
		}).check(write.request);

		expect(response.customerId).toBe("from_autumn");
		const [key] = keysSent(edge);
		expect(key).toBeString();
		expect(keysSent(autumn)).toEqual([key]);
	});

	test(`a check with ${write.name} falls back with the caller's key when the edge refuses the connection`, async () => {
		const autumn = startAutumn();

		await edgeClientFor({
			edgeURL: await closedURL(),
			autumnURL: autumn.url,
		}).check(write.request, { headers: { "Idempotency-Key": "caller_key_1" } });

		expect(keysSent(autumn)).toEqual(["caller_key_1"]);
	});

	test(`a check with ${write.name} keeps one key across every retry and fallback`, async () => {
		const edge = startStub({
			reply: () => Response.json({ code: "atom_unavailable" }, { status: 503 }),
		});
		const autumn = startStub({
			reply: () => Response.json({ message: "Down" }, { status: 503 }),
		});

		await edgeClientFor({
			edgeURL: edge.url,
			autumnURL: autumn.url,
			failOpen: false,
			retryConfig: {
				strategy: "backoff",
				backoff: {
					initialInterval: 1,
					maxInterval: 5,
					exponent: 1,
					maxElapsedTime: 50,
				},
			},
		})
			.check(write.request)
			.catch(() => undefined);

		const keys = [...keysSent(edge), ...keysSent(autumn)];
		expect(edge.requests.length).toBeGreaterThan(1);
		expect(new Set(keys).size).toBe(1);
		expect(keys[0]).toBeString();
	});

	test(`without useEdge, a check with ${write.name} goes to Autumn with no generated key`, async () => {
		const edge = startEdge();
		const autumn = startAutumn();

		await clientFor({ edgeURL: edge.url, autumnURL: autumn.url }).check(
			write.request,
		);

		expect(edge.requests).toHaveLength(0);
		expect(keysSent(autumn)).toEqual([null]);
	});
}

test("a plain check carries no idempotency key to the edge or the fallback", async () => {
	const edge = startStub({
		reply: () => Response.json({ code: "atom_unavailable" }, { status: 503 }),
	});
	const autumn = startAutumn();

	await edgeClientFor({ edgeURL: edge.url, autumnURL: autumn.url }).check(
		CHECK,
	);

	expect(keysSent(edge)).toEqual([null]);
	expect(keysSent(autumn)).toEqual([null]);
});

const FINALIZE = {
	customerId: "customer_123",
	lockId: "lock_1",
	action: "confirm" as const,
};

const finalizeStub = ({ delayMs = 0 }: { delayMs?: number } = {}) =>
	startStub({
		reply: async () => {
			await Bun.sleep(delayMs);
			return Response.json({ success: true });
		},
	});

const pathsSent = (stub: Stub) =>
	stub.requests.map(({ url }) => new URL(url).pathname);

test("useEdge sends finalize to the edge first, with a generated idempotency key", async () => {
	const edge = finalizeStub();
	const autumn = finalizeStub();

	const response = await edgeClientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
	}).balances.finalize(FINALIZE);

	expect(response).toEqual({ success: true });
	expect(pathsSent(edge)).toEqual(["/v1/balances.finalize"]);
	expect(keysSent(edge)[0]).toBeString();
	expect(autumn.requests).toHaveLength(0);
});

test("a finalize sends the caller's idempotency key unchanged", async () => {
	const edge = finalizeStub();
	const autumn = finalizeStub();

	await edgeClientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
	}).balances.finalize(FINALIZE, {
		headers: { "Idempotency-Key": "caller_key_1" },
	});

	expect(keysSent(edge)).toEqual(["caller_key_1"]);
});

test("a finalize falls back after the edge's 1s budget with the same key", async () => {
	const edge = finalizeStub({ delayMs: 2_000 });
	const autumn = finalizeStub();
	const startedAt = Date.now();

	const response = await edgeClientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
	}).balances.finalize(FINALIZE);

	expect(response).toEqual({ success: true });
	expect(Date.now() - startedAt).toBeLessThan(1_800);
	const [key] = keysSent(edge);
	expect(key).toBeString();
	expect(keysSent(autumn)).toEqual([key]);
	expect(pathsSent(autumn)).toEqual(["/v1/balances.finalize"]);
});

for (const down of EDGE_DOWN_REPLIES) {
	test(`a finalize falls back on ${down.name} with the same key`, async () => {
		const edge = startStub({ reply: down.reply });
		const autumn = finalizeStub();

		await edgeClientFor({
			edgeURL: edge.url,
			autumnURL: autumn.url,
		}).balances.finalize(FINALIZE);

		const [key] = keysSent(edge);
		expect(key).toBeString();
		expect(keysSent(autumn)).toEqual([key]);
	});
}

test("a finalize the edge forwarded is returned as is, without asking Autumn again", async () => {
	const edge = startStub({
		reply: () =>
			Response.json(
				{
					message: "Atom is stopping; ask the Autumn API",
					code: "atom_stopping",
				},
				{ status: 503, headers: { "x-atom-forwarded": "atom_stopping" } },
			),
	});
	const autumn = finalizeStub();

	await expect(
		edgeClientFor({
			edgeURL: edge.url,
			autumnURL: autumn.url,
		}).balances.finalize(FINALIZE),
	).rejects.toMatchObject({ statusCode: 503 });
	expect(autumn.requests).toHaveLength(0);
});

test("without useEdge, a finalize goes to Autumn with no generated key", async () => {
	const edge = finalizeStub();
	const autumn = finalizeStub();

	await clientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
	}).balances.finalize(FINALIZE);

	expect(edge.requests).toHaveLength(0);
	expect(keysSent(autumn)).toEqual([null]);
});

test("without an edgeURL, edge calls go straight to Autumn", async () => {
	const autumn = startAutumn();

	const response = await edgeClientFor({ autumnURL: autumn.url }).check(CHECK);

	expect(response.customerId).toBe("from_autumn");
	expect(autumn.requests).toHaveLength(1);
});

test("edge calls carry the client's key, API version and per-call headers", async () => {
	const edge = startEdge();
	const autumn = startAutumn();

	await edgeClientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
		xApiVersion: "2.5.0",
	}).check(CHECK, { headers: { "x-request-source": "test" } });

	const [sent] = edge.requests;
	expect(sent?.headers.get("authorization")).toBe("Bearer am_sk_test");
	expect(sent?.headers.get("x-api-version")).toBe("2.5.0");
	expect(sent?.headers.get("x-request-source")).toBe("test");
});

test("the client's retry config retries the call while both are down", async () => {
	const edge = startStub({
		reply: () => Response.json({ code: "atom_unavailable" }, { status: 503 }),
	});
	const autumn = startStub({
		reply: () => Response.json({ message: "Down" }, { status: 503 }),
	});

	await edgeClientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
		failOpen: false,
		retryConfig: {
			strategy: "backoff",
			backoff: {
				initialInterval: 1,
				maxInterval: 5,
				exponent: 1,
				maxElapsedTime: 50,
			},
		},
	})
		.check(CHECK)
		.catch(() => undefined);

	expect(edge.requests.length).toBeGreaterThan(1);
	expect(autumn.requests.length).toBe(edge.requests.length);
});

test("timeoutMs bounds the whole call, edge and fallback together", async () => {
	const edge = startStub({
		reply: async () => {
			await Bun.sleep(500);
			return Response.json(checkAnswer({ customerId: "from_edge" }));
		},
	});
	const autumn = startAutumn();

	await expect(
		edgeClientFor({
			edgeURL: edge.url,
			autumnURL: autumn.url,
			failOpen: false,
			timeoutMs: 100,
		}).check(CHECK),
	).rejects.toMatchObject({ name: "RequestTimeoutError" });
	expect(autumn.requests).toHaveLength(0);
});

test("a per-call timeout applies to the edge call", async () => {
	const edge = startStub({
		reply: async () => {
			await Bun.sleep(300);
			return Response.json(checkAnswer({ customerId: "from_edge" }));
		},
	});
	const autumn = startAutumn();

	const response = await edgeClientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
		timeoutMs: 100,
	}).check(CHECK, { timeoutMs: 900 });

	expect(response.customerId).toBe("from_edge");
	expect(autumn.requests).toHaveLength(0);
});

test("useEdge routes autumn.check to the edge", async () => {
	const edge = startEdge();
	const autumn = startAutumn();

	const response = await clientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
		useEdge: true,
	}).check(CHECK);

	expect(response.customerId).toBe("from_edge");
	expect(autumn.requests).toHaveLength(0);
});

test("useEdge falls back to Autumn when the edge is down", async () => {
	const autumn = startAutumn();

	const response = await clientFor({
		edgeURL: await closedURL(),
		autumnURL: autumn.url,
		useEdge: true,
	}).check(CHECK);

	expect(response.customerId).toBe("from_autumn");
	expect(autumn.requests).toHaveLength(1);
});

test("without useEdge, autumn.check goes to Autumn even with an edgeURL", async () => {
	const edge = startEdge();
	const autumn = startAutumn();

	const response = await clientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
	}).check(CHECK);

	expect(response.customerId).toBe("from_autumn");
	expect(edge.requests).toHaveLength(0);
});

test("useEdge leaves calls the edge doesn't serve with Autumn", async () => {
	const edge = startEdge();
	const autumn = startStub({
		reply: () =>
			Response.json({ customer_id: "customer_123", value: 1, balance: null }),
	});

	await clientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
		useEdge: true,
	}).track({ customerId: "customer_123", featureId: "messages", value: 1 });

	expect(edge.requests).toHaveLength(0);
	expect(autumn.requests).toHaveLength(1);
});

test("useEdge leaves a per-call serverURL alone", async () => {
	const edge = startEdge();
	const autumn = startAutumn();
	const elsewhere = startStub({
		reply: () => Response.json(checkAnswer({ customerId: "from_elsewhere" })),
	});

	const response = await clientFor({
		edgeURL: edge.url,
		autumnURL: autumn.url,
		useEdge: true,
	}).check(CHECK, { serverURL: elsewhere.url });

	expect(response.customerId).toBe("from_elsewhere");
	expect(edge.requests).toHaveLength(0);
});

// Needs the regenerated client: .speakeasy/patches adds `edgeURL`, `useEdge` and `autumn.edge` to it.
test("autumn.edge is the same client with useEdge on", async () => {
	const edge = startEdge();
	const autumn = startAutumn();
	const options: EdgeSDKOptions = {
		secretKey: "am_sk_test",
		serverURL: autumn.url,
		edgeURL: edge.url,
	};
	const client = new Autumn(options);

	expect((await client.edge.check(CHECK)).customerId).toBe("from_edge");
	expect((await client.check(CHECK)).customerId).toBe("from_autumn");
});
