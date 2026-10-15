import { afterEach, describe, expect, test } from "bun:test";
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
import { createAtomApp } from "../../../src/http/createAtomApp.js";
import { catchUpBeforeServing } from "../../../src/replication/catchUp/catchUpFromPeers.js";
import { createDeployedFolders } from "../../../src/replication/folders/createReplicaFolders.js";
import { peerRequestHeaders } from "../../../src/replication/transport/peerSignature.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
	readThreadStats,
} from "../../../src/threads/stats/threadStats.js";
import {
	allSlotsOwnedHere,
	forwardingNowhere,
	freshHeld,
	loopOnTime,
	noPeer,
	noReplication,
	noSubjectPulls,
	subjectBody,
} from "../utils/atomFixtures.js";
import {
	ATOM_TOKEN,
	AUTUMN_API_URL,
	bodyFor,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	heldEverywhere,
	PEER_PORT,
	PEER_SECRET,
	quiet,
	type Replica,
	settle,
	TOKEN_HASH,
} from "./replicaFixtures.js";

afterEach(() => {
	disconnect();
	cleanUpReplicas();
});

const SECRET_KEY = "Bearer am_sk_test_1";

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

const signedSince = (body: unknown) => {
	const text = JSON.stringify(body);
	return {
		method: "POST",
		headers: peerRequestHeaders({
			secret: PEER_SECRET,
			method: "POST",
			path: "/v1/_peer/subjects.since",
			body: text,
		}),
		body: text,
	};
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
		connect({ replicas: [a, b, c] });

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
		connect({ replicas: [a, b] });

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

	test("the shared catalog goes the same way", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: ["10.0.0.2"] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect({ replicas: [a, b] });
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
	test("copies from a peer what it missed: everything on a fresh volume, only the newer writes on one that was kept", async () => {
		let now = 1_000;
		const a = createReplica({ address: "10.0.0.1", peers: [], now: () => now });
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			now: () => now,
		});
		connect({ replicas: [a, b] });
		for (const [i, customerId] of ["cus_1", "cus_2", "cus_3"].entries())
			await a.app.request("/v1/subjects.set", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-atom-token": ATOM_TOKEN,
					[ATOM_CUSTOMER_ID_HEADER]: customerId,
				},
				body: bodyFor({ customerId, readAt: 1700 + i, balance: 10 + i }),
			});

		await b.sync().catchUp();
		expect(await remainingOn(b)).toBe(10);
		expect((await heldEverywhere(b)).sort()).toEqual([
			"cus_1",
			"cus_2",
			"cus_3",
		]);

		// Later: one newer read on the peer, and a pass copies just that.
		now = 2_000;
		await a.app.request(
			"/v1/subjects.set",
			setSubject({ balance: 3, readAt: 1900 }),
		);
		await b.sync().pass();
		expect(await remainingOn(b)).toBe(3);
	});

	test("serves from what it holds when no peer answers, so two replicas restarting together never wait on each other", async () => {
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect({ replicas: [b] });
		const warnings: string[] = [];
		const logger = {
			info: () => {},
			warn: (fields: unknown) =>
				void warnings.push((fields as { type?: string }).type ?? ""),
		};

		await catchUpBeforeServing({
			ctx: {
				replication: b.replication,
				port: PEER_PORT,
				secret: PEER_SECRET,
				logger,
				sleep: async () => {},
			},
			folders: createDeployedFolders({ slots: b.slots }),
			windowOf: () => null,
		});

		expect(warnings.at(-1)).toBe("atom_catch_up_skipped");
		expect(
			warnings.filter((type) => type === "atom_catch_up_failed").length,
		).toBe(3);
	});

	test("the since route answers only a signed peer, pages from where the last page ended, and refuses another split", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });

		const unsigned = await a.peerApp.request(
			"/v1/_peer/subjects.since",
			post({
				body: {
					slot: 0,
					slotCount: 2,
					after: null,
					window: null,
					cursor: null,
					limit: 10,
				},
			}),
		);
		const ours = await a.peerApp.request(
			"/v1/_peer/subjects.since",
			signedSince({
				slot: 0,
				slotCount: 2,
				after: null,
				window: null,
				cursor: null,
				limit: 10,
			}),
		);
		const otherSplit = await a.peerApp.request(
			"/v1/_peer/subjects.since",
			signedSince({
				slot: 0,
				slotCount: 4,
				after: null,
				window: null,
				cursor: null,
				limit: 10,
			}),
		);
		const windowed = await a.peerApp.request(
			"/v1/_peer/subjects.since",
			signedSince({
				slot: 0,
				slotCount: 2,
				after: null,
				window: 60_000,
				cursor: null,
				limit: 10,
			}),
		);

		expect(unsigned.status).toBe(401);
		expect(ours.status).toBe(200);
		expect(await ours.json()).toEqual({ after: null, subjects: [] });
		expect(otherSplit.status).toBe(409);
		// The window becomes an absolute point by this replica's clock, so later pages continue from it.
		expect(await windowed.json()).toEqual({
			after: 1_000_000 - 60_000,
			subjects: [],
		});
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
		connect({ replicas: [a, b] });
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

	test("answers itself when no peer can be reached: none known or the peer unreachable; a check already proxied once is refused, never answered stale", async () => {
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
		connect({ replicas: [alone, b] });
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
		const check = checkMessages();
		const proxiedTwice = await b.peerApp.request("/v1/balances.check", {
			...check,
			headers: peerRequestHeaders({
				secret: PEER_SECRET,
				method: "POST",
				path: "/v1/balances.check",
				body: check.body,
				headers: check.headers,
			}),
		});

		for (const reply of [noPeer, unreachable]) {
			expect(reply.headers.get("x-atom-proxied")).toBeNull();
			expect((await reply.json()).balance.remaining).toBe(4);
		}
		// Its files may be behind the sender's: the 503 sends the check on to the API instead (owner-hop.test).
		expect(proxiedTwice.status).toBe(503);
		expect((await proxiedTwice.json()).code).toBe("atom_not_ready");
	});
});

describe("the public app", () => {
	test("serves no peer route, and relays nothing where there is no replication (a multi-tenant Atom)", async () => {
		const dataDir = mkdtempSync(join(tmpdir(), "atom-replica-"));
		const threadStats = createThreadStatsBuffer({ threads: 1 });
		const auth = createDeployedAuth({
			journalForwarder: forwardingNowhere,
			dataDir,
			tokenHash: TOKEN_HASH,
			slotCount: 2,
			owners: allSlotsOwnedHere,
			held: freshHeld(),
			subjectPulls: noSubjectPulls,
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
					threadsReady: new Int32Array([1]),
					thread: 0,
					threadStats,
					dataDir: tmpdir(),
				},
				counters: openThreadCounters({ buffer: threadStats, index: 0 }),
				loop: loopOnTime,
				replication: noReplication,
				peer: noPeer,
			},
		});
		try {
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
		} finally {
			auth.close();
			rmSync(dataDir, { recursive: true, force: true });
		}
	});
});
