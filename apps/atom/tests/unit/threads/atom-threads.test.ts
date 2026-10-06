import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAtomEnv } from "@autumn/env/atom";
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

/** The Atom as main.ts runs it, on its own port and folder: the workers are main.ts started again. */
const startAtom = async () => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-threads-"));
	const port = 20_000 + Math.floor(Math.random() * 20_000);
	const env = createAtomEnv({
		ATOM_TOKEN_HASH: hashToken({ token: ATOM_TOKEN }),
		ATOM_DATA_DIR: dataDir,
		ATOM_PORT: String(port),
		ATOM_THREADS: String(THREADS),
		ATOM_SLOT_COUNT: "16",
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
