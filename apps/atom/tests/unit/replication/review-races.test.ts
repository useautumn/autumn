import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { LATEST_VERSION } from "@autumn/shared";
import { createDeployedAuth } from "../../../src/auth/createDeployedAuth.js";
import { hashToken } from "../../../src/auth/hashToken.js";
import { createAtomApp } from "../../../src/http/createAtomApp.js";
import { CATALOG_PUSH, SUBJECT_PUSH } from "../../../src/pushes/applyPushes.js";
import { catchUpFromPeers } from "../../../src/replication/catchUp/catchUpFromPeers.js";
import { createReplication } from "../../../src/replication/createReplication.js";
import { createHandlerRegistry } from "../../../src/replication/handlers/createHandlerRegistry.js";
import { createPeerOutbox } from "../../../src/replication/outbox/createPeerOutbox.js";
import { peerRequestHeaders } from "../../../src/replication/transport/peerSignature.js";
import { customerIdToSlot } from "../../../src/slots/customerIdToSlot.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
} from "../../../src/threads/stats/threadStats.js";
import {
	allSlotsOwnedHere,
	freshHeld,
	subjectBody,
} from "../utils/atomFixtures.js";

const ATOM_TOKEN = "atom_token_1";
const TOKEN_HASH = hashToken({ token: ATOM_TOKEN });
const PORT = 8001;
const SLOT_COUNT = 2;
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

const createReplica = ({
	address,
	peers,
	ready = true,
}: {
	address: string;
	peers: string[];
	ready?: boolean;
}) => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-review-"));
	const threadStats = createThreadStatsBuffer({ threads: 1 });
	const counters = openThreadCounters({ buffer: threadStats, index: 0 });
	const auth = createDeployedAuth({
		dataDir,
		tokenHash: TOKEN_HASH,
		slotCount: SLOT_COUNT,
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
			resolver: { peers: async () => peers, forget: () => {} },
		},
	});
	const app = createAtomApp({
		ctx: {
			auth,
			logger: quiet,
			autumnApiUrl: AUTUMN_API_URL,
			health: {
				bootedAt: "2026-10-12T00:00:00.000Z",
				restarts: new Int32Array(1),
				ready: new Int32Array([ready ? 1 : 0]),
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
	return { address, app, slots: auth.slots, replication };
};

type Replica = ReturnType<typeof createReplica>;

/** The deployment network plus a fake Autumn API; honours the caller's abort signal like a real fetch. */
const connect = ({
	replicas,
	autumn,
}: {
	replicas: Replica[];
	autumn?: (request: Request) => Promise<Response>;
}) => {
	const byAddress = new Map(replicas.map((r) => [r.address, r]));
	const dispatch = async (input: URL | RequestInfo, init?: RequestInit) => {
		const url = new URL(
			typeof input === "string" ? input : (input as Request).url,
		);
		if (url.origin === AUTUMN_API_URL && autumn)
			return autumn(new Request(url, init));
		const replica = byAddress.get(url.hostname);
		if (!replica) throw new Error(`connect ECONNREFUSED ${url.hostname}`);
		return replica.app.request(`${url.pathname}${url.search}`, init);
	};
	spyOn(globalThis, "fetch").mockImplementation(((
		input: URL | RequestInfo,
		init?: RequestInit,
	) => {
		const signal = init?.signal;
		if (!signal) return dispatch(input, init);
		return Promise.race([
			dispatch(input, init),
			new Promise<never>((_, reject) =>
				signal.addEventListener("abort", () => reject(signal.reason)),
			),
		]);
	}) as typeof fetch);
};

/** Customer ids that all live in `slot`, so they share one slot file and one catch-up cursor. */
const customersInSlot = ({ slot, count }: { slot: number; count: number }) => {
	const ids: string[] = [];
	for (let i = 0; ids.length < count; i++) {
		const id = `cus_${i}`;
		if (customerIdToSlot({ customerId: id, slotCount: SLOT_COUNT }) === slot)
			ids.push(id);
	}
	return ids;
};

const bodyFor = ({
	customerId,
	readAt,
	balance = 10,
}: {
	customerId: string;
	readAt: number;
	balance?: number;
}) => {
	const body = subjectBody({ balance });
	return JSON.stringify({
		...body,
		state: {
			...body.state,
			identity: { ...body.state.identity, customerId },
		},
		read_at: readAt,
	});
};

/** Stores a push on one replica only, as when its relay never reached the others. */
const storeOnly = async ({
	replica,
	customerId,
	readAt,
}: {
	replica: Replica;
	customerId: string;
	readAt: number;
}) =>
	replica.slots
		.processorFor({ customerId })
		.setSubject({ customerId, body: bodyFor({ customerId, readAt }) });

const heldIds = async ({ replica, slot }: { replica: Replica; slot: number }) =>
	(await replica.slots.listSince({ slot, readAtAfter: -1, limit: 10_000 })).map(
		(subject) => subject.state.identity.customerId,
	);

const catchUpCtx = (replica: Replica) => ({
	replication: replica.replication,
	port: PORT,
	tokenHash: TOKEN_HASH,
	logger: quiet,
	sleep: async () => {},
});

describe("catch-up races (review of #4605)", () => {
	test("a live relay that lands before catch-up must not move the catch-up cursor past what the replica missed", async () => {
		const [kept, missed, live] = customersInSlot({ slot: 0, count: 3 });
		const a = createReplica({ address: "10.0.0.1", peers: ["10.0.0.2"] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect({ replicas: [a, b] });

		// b held `kept` before it went down; while it was down (> 60 s), a stored `missed` and its relay to b was dropped.
		await storeOnly({ replica: b, customerId: kept, readAt: 1_000 });
		await storeOnly({ replica: a, customerId: kept, readAt: 1_000 });
		await storeOnly({ replica: a, customerId: missed, readAt: 50_000 });
		// b listens before it catches up, so a fresh push relayed by a lands first.
		const liveBody = bodyFor({ customerId: live!, readAt: 200_000 });
		const relayed = await b.app.request("/v1/subjects.set", {
			method: "POST",
			headers: peerRequestHeaders({
				tokenHash: TOKEN_HASH,
				body: liveBody,
				headers: { [ATOM_CUSTOMER_ID_HEADER]: live! },
			}),
			body: liveBody,
		});
		expect(relayed.status).toBe(200);

		await catchUpFromPeers({ ctx: catchUpCtx(b), slots: b.slots });

		expect(await heldIds({ replica: b, slot: 0 })).toContain(missed);
	});

	test("a page boundary between two subjects read in the same millisecond copies both", async () => {
		const ids = customersInSlot({ slot: 0, count: 501 });
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect({ replicas: [a, b] });
		// 499 distinct reads, then two customers Autumn read in the same ms: rows 500 and 501 tie on read_at.
		for (const [i, customerId] of ids.entries())
			await storeOnly({
				replica: a,
				customerId,
				readAt: i < 499 ? 1_000 + i : 9_000,
			});

		await catchUpFromPeers({ ctx: catchUpCtx(b), slots: b.slots });

		expect((await heldIds({ replica: b, slot: 0 })).length).toBe(501);
	});
});

const sendEventCheck = () => ({
	method: "POST",
	headers: {
		"content-type": "application/json",
		authorization: "Bearer am_sk_test_1",
		"x-atom-token": ATOM_TOKEN,
		"x-api-version": LATEST_VERSION,
	},
	body: JSON.stringify({
		customer_id: "cus_1",
		feature_id: "messages",
		send_event: true,
	}),
});

describe("not-ready proxy (review of #4605)", () => {
	test("control: with a fast Autumn, a proxied check that sends an event reaches Autumn once", async () => {
		let autumnCalls = 0;
		const a = createReplica({ address: "10.0.0.1", peers: ["10.0.0.2"] });
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			ready: false,
		});
		connect({
			replicas: [a, b],
			autumn: async () => {
				autumnCalls += 1;
				return Response.json({ allowed: true });
			},
		});

		const reply = await b.app.request("/v1/balances.check", sendEventCheck());

		expect(reply.headers.get("x-atom-proxied")).toBe("starting");
		expect(autumnCalls).toBe(1);
	});

	test("a check that sends an event reaches Autumn once, even when the ready peer's forward outlasts the proxy timeout", async () => {
		let autumnCalls = 0;
		const a = createReplica({ address: "10.0.0.1", peers: ["10.0.0.2"] });
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			ready: false,
		});
		connect({
			replicas: [a, b],
			autumn: async () => {
				autumnCalls += 1;
				await Bun.sleep(2_500);
				return Response.json({ allowed: true });
			},
		});

		await b.app.request("/v1/balances.check", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: "Bearer am_sk_test_1",
				"x-atom-token": ATOM_TOKEN,
				"x-api-version": LATEST_VERSION,
			},
			body: JSON.stringify({
				customer_id: "cus_1",
				feature_id: "messages",
				send_event: true,
			}),
		});
		await Bun.sleep(3_000);

		expect(autumnCalls).toBe(1);
	}, 10_000);
});

describe("outbox bookkeeping (review of #4605)", () => {
	test("a peer that leaves while deliveries are in flight leaves nothing counted as waiting, so stop does not wait out the flush window", async () => {
		let known = ["10.0.0.2"];
		const sleeps: number[] = [];
		const outbox = createPeerOutbox({
			ctx: {
				resolver: { peers: async () => known, forget: () => {} },
				send: async () => {
					await Bun.sleep(5);
					return false;
				},
				counters: { add: () => {} },
				logger: { warn: () => {} },
				sleep: async (ms) => {
					sleeps.push(ms);
				},
				now: () => 0,
			},
		});
		for (let i = 0; i < 10; i++)
			await outbox.enqueue({
				operation: { kind: "subjects.set", key: `cus_${i}`, body: "{}" },
				path: "/v1/subjects.set",
			});
		known = [];
		await Bun.sleep(100);

		await outbox.stop();

		expect(sleeps).not.toContain(5_000);
	});
});
