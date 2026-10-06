import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAtomEnv } from "@autumn/env/atom";
import { hashToken } from "../../../src/auth/hashToken.js";
import { createAtomThreads } from "../../../src/threads/createAtomThreads.js";
import { subjectBody } from "../utils/atomFixtures.js";

const ATOM_TOKEN = "atom_token_threads";
const THREADS = 3;
const MAIN = join(import.meta.dir, "../../../src/main.ts");
const quietLogger = { info() {}, warn() {}, error() {} };

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const stop of stops.splice(0)) await stop();
});

/** A port nothing on this machine listens on right now. */
const freePort = () => {
	const probe = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response(),
	});
	const { port } = probe;
	probe.stop(true);
	return port;
};

/** The Atom as main.ts runs it, on its own port and folder: the workers are main.ts started again. */
const startAtom = async () => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-threads-"));
	const port = freePort();
	const env = createAtomEnv({
		ATOM_TOKEN_HASH: hashToken({ token: ATOM_TOKEN }),
		ATOM_DATA_DIR: dataDir,
		ATOM_PORT: String(port),
		ATOM_THREADS: String(THREADS),
		ATOM_SLOT_COUNT: "16",
		AUTUMN_API_URL: "http://127.0.0.1:9",
	});
	const workers: Worker[] = [];
	const atom = createAtomThreads({
		ctx: {
			spawnThread: () => {
				const worker = new Worker(MAIN);
				workers.push(worker);
				return worker;
			},
			logger: quietLogger,
		},
		config: { env },
	});
	await atom.start();
	stops.push(async () => {
		await atom.stop();
		rmSync(dataDir, { recursive: true, force: true });
	});
	return { url: `http://127.0.0.1:${port}`, workers };
};

const customerIds = Array.from({ length: 24 }, (_, i) => `cus_thread_${i}`);

// A fresh connection per request, so the kernel spreads them over every thread.
const post = ({
	url,
	path,
	body,
}: {
	url: string;
	path: string;
	body: unknown;
}) =>
	fetch(`${url}${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-token": ATOM_TOKEN,
			"x-api-version": "2.1",
			connection: "close",
		},
		body: JSON.stringify(body),
	});

const pushCustomer = ({
	url,
	customerId,
	balance,
}: {
	url: string;
	customerId: string;
	balance: number;
}) => {
	const body = subjectBody({ balance });
	return post({
		url,
		path: "/v1/subjects.set",
		body: {
			...body,
			state: {
				...body.state,
				identity: { ...body.state.identity, customerId },
			},
		},
	});
};

const checkCustomer = ({
	url,
	customerId,
	requiredBalance,
}: {
	url: string;
	customerId: string;
	requiredBalance: number;
}) =>
	post({
		url,
		path: "/v1/balances.check",
		body: {
			customer_id: customerId,
			feature_id: "messages",
			required_balance: requiredBalance,
		},
	});

describe("an Atom of several threads", () => {
	test("a customer pushed through any thread is answered by every thread", async () => {
		const { url } = await startAtom();
		for (const [i, customerId] of customerIds.entries())
			expect((await pushCustomer({ url, customerId, balance: i })).status).toBe(
				200,
			);

		for (const [i, customerId] of customerIds.entries())
			for (let attempt = 0; attempt < THREADS; attempt++) {
				const response = await checkCustomer({
					url,
					customerId,
					requiredBalance: i,
				});
				expect(response.status).toBe(200);
				expect(await response.json()).toMatchObject({
					allowed: true,
					customer_id: customerId,
					balance: { remaining: i },
				});
			}
	}, 20_000);

	test("a thread that dies is replaced, and the Atom keeps answering meanwhile", async () => {
		const { url, workers } = await startAtom();
		for (const customerId of customerIds)
			await pushCustomer({ url, customerId, balance: 5 });
		const customerId = customerIds[0] ?? "";
		// A connection the kernel hands to the dying thread may never be answered; the next one is.
		const answered = async () => {
			try {
				const response = await fetch(`${url}/v1/balances.check`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-atom-token": ATOM_TOKEN,
						"x-api-version": "2.1",
						connection: "close",
					},
					body: JSON.stringify({
						customer_id: customerId,
						feature_id: "messages",
						required_balance: 5,
					}),
					signal: AbortSignal.timeout(500),
				});
				return response.status === 200;
			} catch {
				return false;
			}
		};
		const health = async (): Promise<{ restarts: number }> => {
			try {
				const response = await fetch(`${url}/health`, {
					signal: AbortSignal.timeout(500),
				});
				return await response.json();
			} catch {
				return { restarts: 0 };
			}
		};

		workers[1]?.terminate();
		const replacedBy = Date.now() + 10_000;
		let answers = 0;
		let restarts = 0;
		while (restarts === 0 && Date.now() < replacedBy) {
			if (await answered()) answers += 1;
			restarts = (await health()).restarts;
		}

		expect(answers).toBeGreaterThan(0);
		expect(restarts).toBe(1);
	}, 20_000);
});
