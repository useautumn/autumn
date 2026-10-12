import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
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
import { createHandlerRegistry } from "../../../src/replication/handlers/createHandlerRegistry.js";
import { createPeerOutbox } from "../../../src/replication/outbox/createPeerOutbox.js";
import { createPeerSender } from "../../../src/replication/transport/sendToPeer.js";
import { customerIdToSlot } from "../../../src/slots/customerIdToSlot.js";
import { peerRequestHeaders } from "../../../src/replication/transport/peerSignature.js";
import {
	createThreadStatsBuffer,
	openThreadCounters,
} from "../../../src/threads/stats/threadStats.js";
import { allSlotsOwnedHere, freshHeld, subjectBody } from "../utils/atomFixtures.js";

const ATOM_TOKEN = "atom_token_1";
const TOKEN_HASH = hashToken({ token: ATOM_TOKEN });
const PORT = 8001;
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

const createReplica = ({ address, peers, ready = true }: { address: string; peers: string[]; ready?: boolean }) => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-fixes-"));
	const threadStats = createThreadStatsBuffer({ threads: 1 });
	const counters = openThreadCounters({ buffer: threadStats, index: 0 });
	const auth = createDeployedAuth({ dataDir, tokenHash: TOKEN_HASH, slotCount: 2, owners: allSlotsOwnedHere, held: freshHeld() });
	const replication = createReplication({
		ctx: { tokenHash: TOKEN_HASH, port: PORT, registry, counters, logger: quiet, resolver: { peers: async () => peers, forget: () => {} } },
	});
	const app = createAtomApp({
		ctx: {
			auth,
			logger: quiet,
			autumnApiUrl: AUTUMN_API_URL,
			health: { bootedAt: "2026-10-12T00:00:00.000Z", restarts: new Int32Array(1), ready: new Int32Array([ready ? 1 : 0]), threadStats },
			counters,
			replication,
			peer: { tokenHash: TOKEN_HASH, port: PORT },
		},
	});
	cleanups.push(() => {
		void replication.stop();
		auth.close();
		rmSync(dataDir, { recursive: true, force: true });
	});
	return { address, app, slots: auth.slots, replication, dataDir };
};

type Replica = ReturnType<typeof createReplica>;

const connect = (replicas: Replica[]) => {
	const byAddress = new Map(replicas.map((r) => [r.address, r]));
	const dispatch = async (input: URL | RequestInfo, init?: RequestInit) => {
		const url = new URL(typeof input === "string" ? input : (input as Request).url);
		const replica = byAddress.get(url.hostname);
		if (!replica) throw new Error(`connect ECONNREFUSED ${url.hostname}`);
		return replica.app.request(`${url.pathname}${url.search}`, init);
	};
	spyOn(globalThis, "fetch").mockImplementation(dispatch as typeof fetch);
};

/** Customer ids that all live in one slot, so they share one file and one catch-up cursor. */
const sameSlot = (count: number) => {
	const ids: string[] = [];
	for (let i = 0; ids.length < count; i++)
		if (customerIdToSlot({ customerId: `cus_${i}`, slotCount: 2 }) === 0) ids.push(`cus_${i}`);
	return ids;
};

const bodyFor = ({ customerId, readAt, balance = 10 }: { customerId: string; readAt: number; balance?: number }) => {
	const body = subjectBody({ balance });
	return JSON.stringify({ ...body, state: { ...body.state, identity: { ...body.state.identity, customerId } }, read_at: readAt });
};

const storeOnly = ({ replica, customerId, readAt }: { replica: Replica; customerId: string; readAt: number }) =>
	replica.slots.processorFor({ customerId }).setSubject({ customerId, body: bodyFor({ customerId, readAt }) });

const heldIds = async ({ replica, slot }: { replica: Replica; slot: number }) =>
	(await replica.slots.listSince({ slot, readAtAfter: -1, limit: 10_000 })).map((s) => s.state.identity.customerId);

const catchUpCtx = (replica: Replica) => ({
	replication: replica.replication,
	port: PORT,
	tokenHash: TOKEN_HASH,
	logger: quiet,
	sleep: async () => {},
});

describe("F2: a write held by one replica alone is repaired", () => {
	test("after a restart, what a replica stored just before it died reaches the peers again", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: ["10.0.0.2"] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect([a, b]);
		// Stored on a with its relay never sent (the process died before the outbox ran).
		await storeOnly({ replica: a, customerId: "cus_1", readAt: 5_000 });

		// a restarts on its volume: its boot sync must send the recent row on, or b's later passes must pull it.
		await catchUpFromPeers({ ctx: catchUpCtx(a), slots: a.slots });
		await new Promise((resolve) => setTimeout(resolve, 50));

		const held = (await heldIds({ replica: b, slot: 0 })).concat(await heldIds({ replica: b, slot: 1 }));
		expect(held).toContain("cus_1");
	});
});

describe("F5: the peer surface is not on the public endpoint", () => {
	test("a peer-signed push on the public app is refused", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const body = bodyFor({ customerId: "cus_1", readAt: 1_000 });

		const reply = await a.app.request("/v1/subjects.set", {
			method: "POST",
			headers: peerRequestHeaders({ tokenHash: TOKEN_HASH, body, headers: { [ATOM_CUSTOMER_ID_HEADER]: "cus_1" } }),
			body,
		});

		expect(reply.status).toBe(401);
	});

	test("the public app has no since route", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const body = JSON.stringify({ slot: 0, slotCount: 2, readAtAfter: 0, limit: 10 });

		const reply = await a.app.request("/v1/_peer/subjects.since", {
			method: "POST",
			headers: peerRequestHeaders({ tokenHash: TOKEN_HASH, body }),
			body,
		});

		expect(reply.status).toBe(404);
	});
});

describe("F6: the catalog is caught up", () => {
	test("a replica catching up takes the peer's newer catalog", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect([a, b]);
		const rows = createCatalogRowsFor({ state: createState() });
		await a.slots.setCatalog({ rows, readAt: 1_700 });

		await catchUpFromPeers({ ctx: catchUpCtx(b), slots: b.slots });

		expect(b.slots.installCatalog({ rows: [], readAt: 1_699 })).toBe(false);
	});
});

describe("F7: only a ready peer is a source", () => {
	test("a replica that is not ready answers since with 503", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [], ready: false });
		const body = JSON.stringify({ slot: 0, slotCount: 2, readAtAfter: 0, limit: 10 });

		const reply = await a.app.request("/v1/_peer/subjects.since", {
			method: "POST",
			headers: peerRequestHeaders({ tokenHash: TOKEN_HASH, body }),
			body,
		});

		expect(reply.status).toBe(503);
	});
});

describe("F8: the catch-up window is in apply time, not Autumn's read time", () => {
	test("a push read long ago but applied on the peer after this replica's newest write is copied", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect([a, b]);
		const [kept, late] = sameSlot(2) as [string, string];
		// b holds a read at 100 s; a applies, later, a push Autumn read at 10 s (delayed > 60 s on its way).
		await storeOnly({ replica: b, customerId: kept, readAt: 100_000 });
		await storeOnly({ replica: a, customerId: kept, readAt: 100_000 });
		await storeOnly({ replica: a, customerId: late, readAt: 10_000 });

		await catchUpFromPeers({ ctx: catchUpCtx(b), slots: b.slots });

		expect(await heldIds({ replica: b, slot: 0 })).toContain(late);
	});
});

describe("F10: a refusal that is not the body's fault is tried again", () => {
	test("a 401 from a peer is not counted as delivered", async () => {
		spyOn(globalThis, "fetch").mockResolvedValue(new Response("unauthorized", { status: 401 }));
		const send = createPeerSender({ ctx: { tokenHash: TOKEN_HASH, port: PORT } });

		const outcome = await send({ peer: "10.0.0.2", path: "/v1/subjects.set", operation: { kind: "subjects.set", key: "cus_1", body: "{}" } });

		expect(outcome).not.toBe(true);
	});
});

describe("F11: what waits for a peer is bounded in bytes", () => {
	test("past the byte budget the oldest copy is dropped and counted", async () => {
		const counts: Record<string, number> = {};
		const outbox = createPeerOutbox({
			ctx: {
				resolver: { peers: async () => ["10.0.0.2"], forget: () => {} },
				send: () => new Promise(() => {}),
				counters: { add: (field) => void (counts[field] = (counts[field] ?? 0) + 1) },
				logger: { warn: () => {} },
				sleep: async () => {},
				now: () => 0,
			},
		});
		const body = "x".repeat(10 * 1024 * 1024);
		for (let i = 0; i < 12; i++)
			await outbox.enqueue({ operation: { kind: "subjects.set", key: `cus_${i}`, body }, path: "/v1/subjects.set" });

		expect(counts.relayDropped ?? 0).toBeGreaterThan(0);
	});
});

describe("catch-up window edge", () => {
	test("a row written exactly at the edge of the window asked for is copied", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect([a, b]);
		const [kept, edge] = sameSlot(2) as [string, string];
		await storeOnly({ replica: b, customerId: kept, readAt: 100_000 });
		await storeOnly({ replica: a, customerId: kept, readAt: 100_000 });
		// Exactly 60 s before b's newest read: the margin's edge.
		await storeOnly({ replica: a, customerId: edge, readAt: 40_000 });

		await catchUpFromPeers({ ctx: catchUpCtx(b), slots: b.slots });

		expect(await heldIds({ replica: b, slot: 0 })).toContain(edge);
	});
});
