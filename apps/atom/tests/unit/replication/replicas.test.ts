import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { LATEST_VERSION } from "@autumn/shared";
import {
	createCatalogRowsFor,
	createState,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createDeployedAuth } from "../../../src/auth/createDeployedAuth.js";
import { hashToken } from "../../../src/auth/hashToken.js";
import { createAtomApp } from "../../../src/http/createAtomApp.js";
import { CATALOG_PUSH, SUBJECT_PUSH } from "../../../src/pushes/applyPushes.js";
import { catchUpFromPeers } from "../../../src/replication/catchUp/catchUpFromPeers.js";
import { createReplication } from "../../../src/replication/createReplication.js";
import type { PeerResolver } from "../../../src/replication/discovery/createPeerResolver.js";
import { createHandlerRegistry } from "../../../src/replication/handlers/createHandlerRegistry.js";
import {
	PEER_RELAYED_HEADER,
	PEER_SIGNATURE_HEADER,
} from "../../../src/replication/transport/peerSignature.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
	readThreadStats,
} from "../../../src/threads/stats/threadStats.js";
import {
	allSlotsOwnedHere,
	freshHeld,
	subjectBody,
} from "../utils/atomFixtures.js";

const ATOM_TOKEN = "atom_token_1";
const TOKEN_HASH = hashToken({ token: ATOM_TOKEN });
const PORT = 8001;
const SECRET_KEY = "Bearer am_sk_test_1";
const AUTUMN_API_URL = "https://api.autumn.example";
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

const cleanups: (() => void)[] = [];
afterEach(() => {
	spyOn(globalThis, "fetch").mockRestore();
	for (const cleanup of cleanups.splice(0)) cleanup();
});

const registry = createHandlerRegistry();
registry.register(SUBJECT_PUSH);
registry.register(CATALOG_PUSH);

const resolverTo = (addresses: string[]): PeerResolver => ({
	peers: async () => addresses,
	forget: () => {},
});

/** One replica of an org's Atom: its own folder, relaying to the peers its resolver names. */
const createReplica = ({
	address,
	peers,
	ready = true,
}: {
	address: string;
	peers: string[];
	ready?: boolean;
}) => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-replica-"));
	const threadStats = createThreadStatsBuffer({ threads: 1 });
	const counters = openThreadCounters({ buffer: threadStats, index: 0 });
	const auth = createDeployedAuth({
		dataDir,
		tokenHash: TOKEN_HASH,
		slotCount: 2,
		owners: allSlotsOwnedHere,
		held: freshHeld(),
	});
	const replication = createReplication({
		ctx: {
			tokenHash: TOKEN_HASH,
			port: PORT,
			registry,
			counters,
			logger: quiet,
			resolver: resolverTo(peers),
		},
	});
	const readyFlag = new Int32Array([ready ? 1 : 0]);
	const app = createAtomApp({
		ctx: {
			auth,
			logger: quiet,
			autumnApiUrl: AUTUMN_API_URL,
			health: {
				bootedAt: "2026-10-06T00:00:00.000Z",
				restarts: new Int32Array(1),
				ready: readyFlag,
				threadStats,
			},
			counters,
			replication,
			peer: { tokenHash: TOKEN_HASH, port: PORT },
		},
	});
	cleanups.push(() => {
		replication.stop();
		auth.close();
		rmSync(dataDir, { recursive: true, force: true });
	});
	return {
		address,
		app,
		slots: auth.slots,
		replication,
		stats: () => readThreadStats({ buffer: threadStats })[0],
		setReady: (value: boolean) => Atomics.store(readyFlag, 0, value ? 1 : 0),
	};
};

type Replica = ReturnType<typeof createReplica>;

/** The deployment network: a request to a replica's address lands on its app. */
const connect = (replicas: Replica[]) => {
	const byAddress = new Map(
		replicas.map((replica) => [replica.address, replica]),
	);
	const dispatch = async (input: URL | RequestInfo, init?: RequestInit) => {
		const url = new URL(
			typeof input === "string" ? input : (input as Request).url,
		);
		const replica = byAddress.get(url.hostname);
		if (!replica) throw new Error(`connect ECONNREFUSED ${url.hostname}`);
		return replica.app.request(`${url.pathname}${url.search}`, init);
	};
	spyOn(globalThis, "fetch").mockImplementation(dispatch as typeof fetch);
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const post = ({
	body,
	headers = {},
}: {
	body: unknown;
	headers?: Record<string, string>;
}) => ({
	method: "POST",
	headers: { "content-type": "application/json", ...headers },
	body: JSON.stringify(body),
});

const setSubject = ({
	balance,
	customerId = "cus_1",
	readAt = 1700,
}: {
	balance: number;
	customerId?: string;
	readAt?: number;
}) =>
	post({
		headers: {
			"x-atom-token": ATOM_TOKEN,
			[ATOM_CUSTOMER_ID_HEADER]: customerId,
		},
		body: { ...subjectBody({ balance }), read_at: readAt },
	});

const checkMessages = (fields: Record<string, unknown> = {}) =>
	post({
		headers: {
			authorization: SECRET_KEY,
			"x-atom-token": ATOM_TOKEN,
			"x-api-version": LATEST_VERSION,
		},
		body: { customer_id: "cus_1", feature_id: "messages", ...fields },
	});

const remainingOn = async (replica: Replica): Promise<number | undefined> => {
	const reply = await replica.app.request(
		"/v1/balances.check",
		checkMessages(),
	);
	if (reply.headers.get("x-atom-forwarded")) return undefined;
	return (await reply.json()).balance.remaining;
};

describe("a push one replica receives", () => {
	test("is applied there, then on every other replica, each counting what it relayed", async () => {
		const a = createReplica({
			address: "10.0.0.1",
			peers: ["10.0.0.2", "10.0.0.3"],
		});
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1", "10.0.0.3"],
		});
		const c = createReplica({
			address: "10.0.0.3",
			peers: ["10.0.0.1", "10.0.0.2"],
		});
		connect([a, b, c]);

		const stored = await a.app.request(
			"/v1/subjects.set",
			setSubject({ balance: 10 }),
		);
		await settle();

		expect(stored.status).toBe(200);
		expect(await remainingOn(a)).toBe(10);
		expect(await remainingOn(b)).toBe(10);
		expect(await remainingOn(c)).toBe(10);
		expect(a.stats()).toMatchObject({ relayed: 2, relayFailed: 0 });
		// Applied as relayed: passed on no further, or the three would relay to each other forever.
		expect(b.stats()).toMatchObject({ relayed: 0 });
		expect(c.stats()).toMatchObject({ relayed: 0 });
	});

	test("lands the same wherever it arrives: a newer read wins on every replica, an older one is ignored everywhere", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: ["10.0.0.2"] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect([a, b]);

		await b.app.request(
			"/v1/subjects.set",
			setSubject({ balance: 7, readAt: 1800 }),
		);
		await settle();
		const late = await a.app.request(
			"/v1/subjects.set",
			setSubject({ balance: 10, readAt: 1700 }),
		);
		await settle();

		expect(await late.json()).toEqual({ stored: false });
		expect(await remainingOn(a)).toBe(7);
		expect(await remainingOn(b)).toBe(7);
		// An ignored push goes nowhere: the other replica has the newer read already.
		expect(a.stats()).toMatchObject({ relayed: 0 });
	});

	test("a relayed request needs the signature of the token hash; the token itself never travels", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const body = JSON.stringify(subjectBody({ balance: 10 }));

		const forged = await a.app.request("/v1/subjects.set", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[ATOM_CUSTOMER_ID_HEADER]: "cus_1",
				[PEER_RELAYED_HEADER]: "1",
				[PEER_SIGNATURE_HEADER]: "00",
			},
			body,
		});
		const unmarked = await a.app.request("/v1/subjects.set", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[ATOM_CUSTOMER_ID_HEADER]: "cus_1",
			},
			body,
		});

		expect(forged.status).toBe(401);
		expect(await forged.json()).toMatchObject({ code: "atom_peer_rejected" });
		expect(unmarked.status).toBe(401);
		expect(await remainingOn(a)).toBeUndefined();
	});

	test("the shared catalog goes the same way", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: ["10.0.0.2"] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect([a, b]);
		const rows = createCatalogRowsFor({ state: createState() });
		const set = await a.app.request(
			"/v1/catalog.set",
			post({
				headers: { "x-atom-token": ATOM_TOKEN },
				body: { rows, read_at: 1700 },
			}),
		);
		await settle();

		expect(await set.json()).toEqual({ stored: true });
		expect(a.stats()).toMatchObject({ relayed: 1 });
		// b holds the read a relayed: an older one is ignored there now.
		expect(b.slots.installCatalog({ rows: [], readAt: 1699 })).toBe(false);
	});
});

describe("a replica that starts", () => {
	test("copies from a peer what it missed: everything on a fresh volume, only the newest reads on one that was kept", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect([a, b]);
		for (const [i, customerId] of ["cus_1", "cus_2", "cus_3"].entries())
			await a.app.request(
				"/v1/subjects.set",
				setSubject({ balance: 10 + i, customerId, readAt: 1700 + i }),
			);

		const ctx = {
			replication: b.replication,
			port: PORT,
			tokenHash: TOKEN_HASH,
			logger: quiet,
			sleep: async () => {},
		};
		await catchUpFromPeers({ ctx, slots: b.slots });
		expect(await remainingOn(b)).toBe(10);
		expect(
			b.slots
				.listSince({ slot: 0, readAtAfter: 0, limit: 10 })
				.then((s) => s.length),
		).resolves.toBe(
			(await a.slots.listSince({ slot: 0, readAtAfter: 0, limit: 10 })).length,
		);

		// Later: one newer read on the peer, and a second catch-up copies just that.
		await a.app.request(
			"/v1/subjects.set",
			setSubject({ balance: 3, readAt: 1900 }),
		);
		await catchUpFromPeers({ ctx, slots: b.slots });
		expect(await remainingOn(b)).toBe(3);
	});

	test("serves from what it holds when no peer answers, so two replicas restarting together never wait on each other", async () => {
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect([b]);
		const warnings: string[] = [];
		const logger = {
			info: () => {},
			warn: (fields: unknown) =>
				void warnings.push((fields as { type?: string }).type ?? ""),
		};

		await catchUpFromPeers({
			ctx: {
				replication: b.replication,
				port: PORT,
				tokenHash: TOKEN_HASH,
				logger,
				sleep: async () => {},
			},
			slots: b.slots,
		});

		expect(warnings.at(-1)).toBe("atom_catch_up_skipped");
		expect(
			warnings.filter((type) => type === "atom_catch_up_failed").length,
		).toBe(3);
	});

	test("the since route answers only a signed peer, and only one split the same way", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });

		const unsigned = await a.app.request(
			"/v1/_peer/subjects.since",
			post({ body: { slot: 0, slotCount: 2, readAtAfter: 0, limit: 10 } }),
		);
		const withToken = await a.app.request(
			"/v1/_peer/subjects.since",
			post({
				headers: { "x-atom-token": ATOM_TOKEN },
				body: { slot: 0, slotCount: 2, readAtAfter: 0, limit: 10 },
			}),
		);

		const otherSplit = await a.app.request(
			"/v1/_peer/subjects.since",
			post({
				headers: { "x-atom-token": ATOM_TOKEN },
				body: { slot: 0, slotCount: 4, readAtAfter: 0, limit: 10 },
			}),
		);

		expect(unsigned.status).toBe(401);
		expect(withToken.status).toBe(200);
		expect(await withToken.json()).toEqual({ subjects: [] });
		// A replica split into other files holds nothing this one can copy; the caller moves on.
		expect(otherSplit.status).toBe(409);
	});
});

describe("a replica not ready yet", () => {
	test("says so on /health, and hands its checks to a ready peer until it is", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: ["10.0.0.2"] });
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			ready: false,
		});
		connect([a, b]);
		await a.app.request("/v1/subjects.set", setSubject({ balance: 10 }));
		await settle();
		// What b holds differs, so the answer tells who answered.
		await b.slots.processorFor({ customerId: "cus_1" }).setSubject({
			customerId: "cus_1",
			body: JSON.stringify({ ...subjectBody({ balance: 4 }), read_at: 1800 }),
		});

		const health = await b.app.request("/health");
		const whileStarting = await b.app.request(
			"/v1/balances.check",
			checkMessages(),
		);
		b.setReady(true);
		const onceReady = await b.app.request(
			"/v1/balances.check",
			checkMessages(),
		);

		expect(health.status).toBe(503);
		expect(await health.json()).toMatchObject({ status: "starting" });
		expect(whileStarting.headers.get("x-atom-proxied")).toBe("starting");
		expect((await whileStarting.json()).balance.remaining).toBe(10);
		expect(onceReady.headers.get("x-atom-proxied")).toBeNull();
		expect((await onceReady.json()).balance.remaining).toBe(4);
		expect((await b.app.request("/health")).status).toBe(200);
	});

	test("answers itself when no peer can: none known, the peer unreachable, or the check already proxied once", async () => {
		const alone = createReplica({
			address: "10.0.0.1",
			peers: [],
			ready: false,
		});
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.9"],
			ready: false,
		});
		connect([alone, b]);
		for (const replica of [alone, b])
			await replica.slots.processorFor({ customerId: "cus_1" }).setSubject({
				customerId: "cus_1",
				body: JSON.stringify(subjectBody({ balance: 4 })),
			});

		const noPeer = await alone.app.request(
			"/v1/balances.check",
			checkMessages(),
		);
		const unreachable = await b.app.request(
			"/v1/balances.check",
			checkMessages(),
		);
		const proxiedTwice = await b.app.request("/v1/balances.check", {
			...checkMessages(),
			headers: { ...checkMessages().headers, "x-atom-proxied": "1" },
		});

		for (const reply of [noPeer, unreachable, proxiedTwice]) {
			expect(reply.headers.get("x-atom-proxied")).toBeNull();
			expect((await reply.json()).balance.remaining).toBe(4);
		}
	});
});

describe("without peers", () => {
	test("a deployed Atom with no replication context accepts no relayed request and relays nothing", async () => {
		const dataDir = mkdtempSync(join(tmpdir(), "atom-replica-"));
		const threadStats = createThreadStatsBuffer({ threads: 1 });
		const auth = createDeployedAuth({
			dataDir,
			tokenHash: TOKEN_HASH,
			slotCount: 2,
			owners: allSlotsOwnedHere,
			held: freshHeld(),
		});
		cleanups.push(() => {
			auth.close();
			rmSync(dataDir, { recursive: true, force: true });
		});
		const app = createAtomApp({
			ctx: {
				auth,
				logger: quiet,
				autumnApiUrl: AUTUMN_API_URL,
				health: {
					bootedAt: "2026-10-06T00:00:00.000Z",
					restarts: new Int32Array(1),
					ready: new Int32Array([1]),
					threadStats,
				},
				counters: openThreadCounters({ buffer: threadStats, index: 0 }),
			},
		});

		const since = await app.request(
			"/v1/_peer/subjects.since",
			post({ headers: { "x-atom-token": ATOM_TOKEN }, body: {} }),
		);
		const stored = await app.request(
			"/v1/subjects.set",
			setSubject({ balance: 10 }),
		);

		expect(since.status).toBe(404);
		expect(stored.status).toBe(200);
		expect(readThreadStats({ buffer: threadStats })[0]).toMatchObject({
			relayed: 0,
		});
	});
});
