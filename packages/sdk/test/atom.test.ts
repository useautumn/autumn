import { afterEach, expect, test } from "bun:test";
import { Atom } from "../src/hooks/atom/atom.js";
import type { AtomSDKOptions } from "../src/hooks/atom/types/atomSDKOptions.js";
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

const atomFor = ({
	atomURL,
	autumnURL,
	...options
}: { atomURL?: string; autumnURL: string } & AtomSDKOptions): Atom => {
	const clientOptions: AtomSDKOptions = {
		secretKey: "am_sk_test",
		serverURL: autumnURL,
		retryConfig: { strategy: "none" },
		...options,
	};
	if (atomURL !== undefined) clientOptions.atomURL = atomURL;
	return new Atom(clientOptions);
};

const CHECK = { customerId: "customer_123", featureId: "messages" };

const ATOM_DOWN_REPLIES = [
	{
		name: "503 atom_unavailable (owner thread shed or restarting)",
		reply: () =>
			Response.json(
				{ message: "Atom thread 1 is unavailable", code: "atom_unavailable" },
				{ status: 503 },
			),
	},
	{
		name: "500 internal_error (Atom could not answer)",
		reply: () =>
			Response.json(
				{ message: "Atom could not answer", code: "internal_error" },
				{ status: 500 },
			),
	},
	{
		name: "502 from a proxy in front of Atom",
		reply: () => new Response("Bad Gateway", { status: 502 }),
	},
	{
		name: "504 from a proxy in front of Atom",
		reply: () => new Response("Gateway Timeout", { status: 504 }),
	},
];

for (const failOpen of [true, false]) {
	for (const down of ATOM_DOWN_REPLIES) {
		test(`falls back to Autumn on ${down.name} (failOpen: ${failOpen})`, async () => {
			const atom = startStub({ reply: down.reply });
			const autumn = startAutumn();

			const response = await atomFor({
				atomURL: atom.url,
				autumnURL: autumn.url,
				failOpen,
			}).check(CHECK);

			expect(response.customerId).toBe("from_autumn");
			expect(atom.requests).toHaveLength(1);
			expect(autumn.requests).toHaveLength(1);
		});
	}

	test(`falls back to Autumn when Atom refuses the connection (failOpen: ${failOpen})`, async () => {
		const autumn = startAutumn();

		const response = await atomFor({
			atomURL: await closedURL(),
			autumnURL: autumn.url,
			failOpen,
		}).check(CHECK);

		expect(response.customerId).toBe("from_autumn");
		expect(autumn.requests).toHaveLength(1);
	});

	test(`falls back to Autumn when Atom times out (failOpen: ${failOpen})`, async () => {
		const atom = startStub({
			reply: async () => {
				await Bun.sleep(500);
				return Response.json(checkAnswer({ customerId: "from_atom" }));
			},
		});
		const autumn = startAutumn();

		const response = await atomFor({
			atomURL: atom.url,
			autumnURL: autumn.url,
			failOpen,
			timeoutMs: 100,
		}).check(CHECK);

		expect(response.customerId).toBe("from_autumn");
		expect(autumn.requests).toHaveLength(1);
	});
}

test("Atom's own answer is returned without asking Autumn", async () => {
	const atom = startStub({
		reply: () => Response.json(checkAnswer({ customerId: "from_atom" })),
	});
	const autumn = startAutumn();

	const response = await atomFor({
		atomURL: atom.url,
		autumnURL: autumn.url,
	}).check(CHECK);

	expect(response.customerId).toBe("from_atom");
	expect(atom.requests.map(({ url }) => new URL(url).pathname)).toEqual([
		"/v1/balances.check",
	]);
	expect(autumn.requests).toHaveLength(0);
});

const REAL_ANSWERS = [
	{
		name: "400 invalid_request from Atom",
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
				{ status: 503, headers: { "x-atom-forwarded": "customer_not_stored" } },
			),
	},
	{
		name: "502 atom_upstream_unreachable (Atom tried the API)",
		status: 502,
		reply: () =>
			Response.json(
				{
					message: "Atom could not reach the Autumn API",
					code: "atom_upstream_unreachable",
				},
				{ status: 502, headers: { "x-atom-forwarded": "customer_not_stored" } },
			),
	},
];

for (const answer of REAL_ANSWERS) {
	test(`never falls back on ${answer.name}`, async () => {
		const atom = startStub({ reply: answer.reply });
		const autumn = startAutumn();

		await expect(
			atomFor({
				atomURL: atom.url,
				autumnURL: autumn.url,
				failOpen: false,
			}).check(CHECK),
		).rejects.toMatchObject({ statusCode: answer.status });
		expect(autumn.requests).toHaveLength(0);
	});
}

test("a forwarded 5xx still fails open like autumn.check, without asking Autumn again", async () => {
	const atom = startStub({
		reply: () =>
			Response.json(
				{ message: "Down" },
				{ status: 503, headers: { "x-atom-forwarded": "customer_not_stored" } },
			),
	});
	const autumn = startAutumn();

	const response = await atomFor({
		atomURL: atom.url,
		autumnURL: autumn.url,
	}).check(CHECK);

	expect(response).toMatchObject({ allowed: true, balance: null });
	expect(autumn.requests).toHaveLength(0);
});

test("fails open when Atom and Autumn are both down", async () => {
	const atom = startStub({
		reply: () => Response.json({ code: "atom_unavailable" }, { status: 503 }),
	});
	const autumn = startStub({
		reply: () => Response.json({ message: "Down" }, { status: 503 }),
	});

	const response = await atomFor({
		atomURL: atom.url,
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

for (const write of WRITES) {
	test(`a check with ${write.name} goes straight to Autumn`, async () => {
		const atom = startStub({
			reply: () => Response.json(checkAnswer({ customerId: "from_atom" })),
		});
		const autumn = startAutumn();

		const response = await atomFor({
			atomURL: atom.url,
			autumnURL: autumn.url,
		}).check(write.request);

		expect(response.customerId).toBe("from_autumn");
		expect(atom.requests).toHaveLength(0);
		expect(autumn.requests).toHaveLength(1);
	});
}

test("without an atomURL, checks go straight to Autumn", async () => {
	const autumn = startAutumn();

	const response = await atomFor({ autumnURL: autumn.url }).check(CHECK);

	expect(response.customerId).toBe("from_autumn");
	expect(autumn.requests).toHaveLength(1);
});

test("Atom calls carry the client's key, API version and per-call headers", async () => {
	const atom = startStub({
		reply: () => Response.json(checkAnswer({ customerId: "from_atom" })),
	});
	const autumn = startAutumn();

	await atomFor({
		atomURL: atom.url,
		autumnURL: autumn.url,
		xApiVersion: "2.5.0",
	}).check(CHECK, { headers: { "x-request-source": "test" } });

	const [sent] = atom.requests;
	expect(sent?.headers.get("authorization")).toBe("Bearer am_sk_test");
	expect(sent?.headers.get("x-api-version")).toBe("2.5.0");
	expect(sent?.headers.get("x-request-source")).toBe("test");
});

test("Atom calls are retried by the client's retry config before falling back", async () => {
	const atom = startStub({
		reply: () => Response.json({ code: "atom_unavailable" }, { status: 503 }),
	});
	const autumn = startAutumn();

	const response = await atomFor({
		atomURL: atom.url,
		autumnURL: autumn.url,
		retryConfig: {
			strategy: "backoff",
			backoff: {
				initialInterval: 1,
				maxInterval: 5,
				exponent: 1,
				maxElapsedTime: 50,
			},
		},
	}).check(CHECK);

	expect(atom.requests.length).toBeGreaterThan(1);
	expect(response.customerId).toBe("from_autumn");
});

test("a per-call timeout applies to the Atom call", async () => {
	const atom = startStub({
		reply: async () => {
			await Bun.sleep(300);
			return Response.json(checkAnswer({ customerId: "from_atom" }));
		},
	});
	const autumn = startAutumn();
	const atomClient = atomFor({
		atomURL: atom.url,
		autumnURL: autumn.url,
		timeoutMs: 100,
	});

	const response = await atomClient.check(CHECK, { timeoutMs: 1_000 });

	expect(response.customerId).toBe("from_atom");
	expect(autumn.requests).toHaveLength(0);
});

// Needs the regenerated client: .speakeasy/patches adds `atomURL` and `autumn.atom` to it.
test("autumn.atom is an Atom on the same client options", async () => {
	const atom = startStub({
		reply: () => Response.json(checkAnswer({ customerId: "from_atom" })),
	});
	const options: AtomSDKOptions = {
		secretKey: "am_sk_test",
		atomURL: atom.url,
	};
	const autumn = new Autumn(options);

	expect(autumn.atom).toBeInstanceOf(Atom);
	expect((await autumn.atom.check(CHECK)).customerId).toBe("from_atom");
});
