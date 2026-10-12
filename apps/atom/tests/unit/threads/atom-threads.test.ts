import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ATOM_CUSTOMER_ID_HEADER, ATOM_SUBJECT_READ_PATH } from "@autumn/byoc";
import { createAtomEnv } from "@autumn/env/atom";
import {
	createCatalogRowsFor,
	createState,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { hashToken } from "../../../src/auth/hashToken.js";
import { customerIdToSlot } from "../../../src/slots/customerIdToSlot.js";
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
const startAtom = async ({
	autumnApiUrl = "http://127.0.0.1:9",
}: {
	autumnApiUrl?: string;
} = {}) => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-threads-"));
	const port = freePort();
	const env = createAtomEnv({
		ATOM_TOKEN_HASH: hashToken({ token: ATOM_TOKEN }),
		ATOM_DATA_DIR: dataDir,
		ATOM_PORT: String(port),
		ATOM_THREADS: String(THREADS),
		ATOM_SLOT_COUNT: "16",
		AUTUMN_API_URL: autumnApiUrl,
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
const ownerOf = (customerId: string) =>
	customerIdToSlot({ customerId, slotCount: 16 }) % THREADS;

// A fresh connection per request, so the kernel spreads them over every thread.
const post = ({
	url,
	path,
	body,
	headers,
}: {
	url: string;
	path: string;
	body: unknown;
	headers?: Record<string, string>;
}) =>
	fetch(`${url}${path}`, {
		method: "POST",
		headers: {
			...headers,
			"content-type": "application/json",
			"x-atom-token": ATOM_TOKEN,
			"x-api-version": "2.1",
			connection: "close",
		},
		body: JSON.stringify(body),
	});

/** Without features, the customer's own catalog cannot answer a check: the shared catalog must. */
const pushCustomer = ({
	url,
	customerId,
	balance,
	withFeatures = true,
}: {
	url: string;
	customerId: string;
	balance: number;
	withFeatures?: boolean;
}) => {
	const body = subjectBody({ balance });
	return post({
		url,
		path: "/v1/subjects.set",
		headers: { [ATOM_CUSTOMER_ID_HEADER]: customerId },
		body: {
			...body,
			state: {
				...body.state,
				identity: { ...body.state.identity, customerId },
			},
			catalog: withFeatures ? body.catalog : { ...body.catalog, features: {} },
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
	test("each customer is stored and answered by its owner, whichever thread the request reaches", async () => {
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

	test("the shared catalog is stored once and held by every thread, so each owner answers from it", async () => {
		const { url } = await startAtom();
		for (const customerId of customerIds)
			await pushCustomer({ url, customerId, balance: 3, withFeatures: false });
		const rows = createCatalogRowsFor({ state: createState() });

		const stored = await post({
			url,
			path: "/v1/catalog.set",
			body: { rows, read_at: 1800 },
		});
		const older = await Promise.all(
			Array.from({ length: THREADS * 2 }, () =>
				post({ url, path: "/v1/catalog.set", body: { rows, read_at: 1750 } }),
			),
		);

		expect(await stored.json()).toEqual({ stored: true });
		for (const response of older)
			expect(await response.json()).toEqual({ stored: false });
		expect(new Set(customerIds.map(ownerOf)).size).toBe(THREADS);
		for (const customerId of customerIds) {
			const response = await checkCustomer({
				url,
				customerId,
				requiredBalance: 3,
			});
			expect(await response.json()).toMatchObject({ allowed: true });
		}
	}, 20_000);

	test("a thread that dies is replaced: its customers get 503s meanwhile, then answers again", async () => {
		const { url, workers } = await startAtom();
		for (const customerId of customerIds)
			await pushCustomer({ url, customerId, balance: 5 });
		const orphaned = customerIds.filter(
			(customerId) => ownerOf(customerId) === 1,
		);
		expect(orphaned.length).toBeGreaterThan(0);

		workers[1]?.terminate();
		const statuses = new Set<number>();
		const recoveredBy = Date.now() + 10_000;
		let recovered = false;
		while (!recovered && Date.now() < recoveredBy) {
			const responses = await Promise.all(
				orphaned.map((customerId) =>
					checkCustomer({ url, customerId, requiredBalance: 1 }).catch(
						() => null,
					),
				),
			);
			for (const response of responses)
				if (response) statuses.add(response.status);
			recovered = responses.every((response) => response?.status === 200);
		}

		expect(statuses.has(503)).toBe(true);
		expect(recovered).toBe(true);
		// The new owner reads its customers back from the files.
		const after = await checkCustomer({
			url,
			customerId: orphaned[0] ?? "",
			requiredBalance: 5,
		});
		expect(await after.json()).toMatchObject({ allowed: true });
		const health = await (await fetch(`${url}/health`)).json();
		expect(health.restarts).toBe(1);
	}, 20_000);
});

describe("calls between threads when one goes", () => {
	test("checks waiting on an owner that dies get 503s at once, not a hang", async () => {
		const { url, workers } = await startAtom();
		for (const customerId of customerIds)
			await pushCustomer({ url, customerId, balance: 5 });
		const ownedByOne = customerIds.filter((id) => ownerOf(id) === 1);

		// Many checks in flight from every thread, then the owner of thread 1's customers dies mid-flight.
		const inFlight = Array.from({ length: 60 }, (_, i) =>
			checkCustomer({
				url,
				customerId: ownedByOne[i % ownedByOne.length] ?? "",
				requiredBalance: 1,
			}).then(
				(response) => response.status,
				() => 0,
			),
		);
		workers[1]?.terminate();
		const settledBy = Date.now() + 3_000;
		const statuses = await Promise.race([
			Promise.all(inFlight),
			Bun.sleep(settledBy - Date.now()).then(() => null),
		]);

		expect(statuses).not.toBeNull();
		for (const status of statuses ?? [])
			expect([200, 503, 0]).toContain(status);
	}, 20_000);

	test("stop finishes while checks are hopping between threads", async () => {
		const { url } = await startAtom();
		for (const customerId of customerIds)
			await pushCustomer({ url, customerId, balance: 5 });
		const hopping = Array.from({ length: 30 }, (_, i) =>
			checkCustomer({
				url,
				customerId: customerIds[i % customerIds.length] ?? "",
				requiredBalance: 1,
			}).catch(() => null),
		);

		const startedAt = Date.now();
		await stops.pop()?.();
		await Promise.all(hopping);

		expect(Date.now() - startedAt).toBeLessThan(5_000);
	}, 20_000);
});

/** Autumn as an Atom reaches it: a pull waits until the test answers it (the subject does not exist); a forward is allowed. */
const startFakeAutumn = () => {
	const pulls: unknown[] = [];
	const firstPull = Promise.withResolvers<void>();
	const answerPulls = Promise.withResolvers<void>();
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: async (request) => {
			if (new URL(request.url).pathname !== ATOM_SUBJECT_READ_PATH)
				return Response.json({ allowed: true });
			pulls.push(await request.json());
			firstPull.resolve();
			await answerPulls.promise;
			return Response.json({ code: "subject_not_found" }, { status: 404 });
		},
	});
	stops.push(async () => {
		answerPulls.resolve();
		server.stop(true);
	});
	return {
		url: `http://127.0.0.1:${server.port}`,
		pulls,
		firstPull: firstPull.promise,
	};
};

describe("pulls across threads", () => {
	test("R10 a subject missed on every thread is pulled once, by its owner, while every check is still forwarded", async () => {
		const autumn = startFakeAutumn();
		const { url } = await startAtom({ autumnApiUrl: autumn.url });
		const checks = THREADS * 4;
		const forwarded: (string | null)[] = [];
		for (let i = 0; i < checks; i++) {
			const response = await checkCustomer({
				url,
				customerId: "cus_missing",
				requiredBalance: 1,
			});
			forwarded.push(response.headers.get("x-atom-forwarded"));
		}
		await autumn.firstPull;

		const health = await (await fetch(`${url}/health`)).json();
		const sumOf = (field: string) =>
			health.threads.reduce(
				(sum: number, thread: Record<string, number>) => sum + thread[field],
				0,
			);
		expect(new Set(forwarded)).toEqual(new Set(["customer_not_stored"]));
		expect(sumOf("subjectMisses")).toBe(checks);
		expect(sumOf("subjectPulls")).toBe(1);
		expect(autumn.pulls).toEqual([
			{ customer_id: "cus_missing", entity_id: null },
		]);
	}, 20_000);
});
