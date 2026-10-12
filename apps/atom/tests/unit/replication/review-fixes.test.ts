import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import {
	createCatalogRowsFor,
	createState,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { ANTI_ENTROPY_WINDOW_MS } from "../../../src/replication/createReplicaSync.js";
import { createPeerOutbox } from "../../../src/replication/outbox/createPeerOutbox.js";
import { peerRequestHeaders } from "../../../src/replication/transport/peerSignature.js";
import { createPeerSender } from "../../../src/replication/transport/sendToPeer.js";
import {
	storedEntitySubjectWith,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";
import {
	ATOM_TOKEN,
	bodyFor,
	cleanUpReplicas,
	connect,
	createReplica,
	customersInSlot,
	disconnect,
	heldEverywhere,
	heldIds,
	PEER_PORT,
	PEER_SECRET,
	settle,
	storeOnly,
} from "./replicaFixtures.js";

afterEach(() => {
	disconnect();
	cleanUpReplicas();
});

const signed = ({
	path,
	body,
	customerId,
}: {
	path: string;
	body: string;
	customerId?: string;
}) => ({
	method: "POST",
	headers: peerRequestHeaders({
		secret: PEER_SECRET,
		method: "POST",
		path,
		customerId,
		body,
		headers: customerId ? { [ATOM_CUSTOMER_ID_HEADER]: customerId } : {},
	}),
	body,
});

const sinceBody = JSON.stringify({
	slot: 0,
	slotCount: 2,
	after: null,
	window: null,
	cursor: null,
	limit: 10,
});

describe("F2: a write held by one replica alone is repaired", () => {
	test("after a restart, what a replica stored just before it died reaches the peers through their next pass", async () => {
		let now = 5_000;
		const a = createReplica({
			address: "10.0.0.1",
			peers: ["10.0.0.2"],
			now: () => now,
		});
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			now: () => now,
		});
		connect({ replicas: [a, b] });
		// Stored on a with its relay never sent (the process died before the outbox ran).
		await storeOnly({ replica: a, customerId: "cus_1", readAt: 5_000 });

		// a restarts on its volume a minute later; b's next pass pulls the row a alone holds.
		now = 65_000;
		await a.sync().catchUp();
		await b.sync().pass();
		await settle();

		expect(await heldEverywhere(b)).toContain("cus_1");
	});

	test("a later pass pulls from every ready peer what it alone holds", async () => {
		let now = 5_000;
		const a = createReplica({
			address: "10.0.0.1",
			peers: ["10.0.0.2", "10.0.0.3"],
			now: () => now,
		});
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1", "10.0.0.3"],
			now: () => now,
		});
		const c = createReplica({
			address: "10.0.0.3",
			peers: ["10.0.0.1", "10.0.0.2"],
			now: () => now,
		});
		connect({ replicas: [a, b, c] });
		await storeOnly({ replica: b, customerId: "cus_1", readAt: 5_000 });
		await storeOnly({ replica: c, customerId: "cus_2", readAt: 5_000 });

		now = 125_000;
		await a.sync().pass();

		expect(await heldEverywhere(a)).toEqual(
			expect.arrayContaining(["cus_1", "cus_2"]),
		);
	});
});

describe("a replica cut off from a peer longer than the repair window", () => {
	test("its next pass reaches back to its last successful one, so a write the peer alone held is still repaired", async () => {
		let now = 5_000;
		const a = createReplica({
			address: "10.0.0.1",
			peers: ["10.0.0.2"],
			now: () => now,
		});
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			now: () => now,
		});
		const sync = b.sync();
		// b sees only itself: a is cut off from it.
		connect({ replicas: [b] });
		now = 10_000;
		await storeOnly({ replica: a, customerId: "cus_1", readAt: 10_000 });
		now = 125_000;
		await sync.pass();
		expect(await heldEverywhere(b)).toEqual([]);

		// Back after longer than the repair window: a's write is older than any fixed window now.
		now = 10_000 + ANTI_ENTROPY_WINDOW_MS + 5 * 60_000;
		disconnect();
		connect({ replicas: [a, b] });
		await sync.pass();

		expect(await heldEverywhere(b)).toEqual(["cus_1"]);
	});
});

describe("F5: the peer surface is not on the public endpoint", () => {
	test("a peer-signed push on the public app is refused: only the Atom token opens it", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const body = bodyFor({ customerId: "cus_1", readAt: 1_000 });

		const reply = await a.app.request(
			"/v1/subjects.set",
			signed({ path: "/v1/subjects.set", body, customerId: "cus_1" }),
		);

		expect(reply.status).toBe(401);
		expect(await heldEverywhere(a)).toEqual([]);
	});

	test("the public app has no since route", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });

		const reply = await a.app.request(
			"/v1/_peer/subjects.since",
			signed({ path: "/v1/_peer/subjects.since", body: sinceBody }),
		);

		expect(reply.status).toBe(404);
	});

	test("the peer app takes only requests signed with the deployment's secret: the Atom token opens nothing there", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const body = bodyFor({ customerId: "cus_1", readAt: 1_000 });

		const withToken = await a.peerApp.request("/v1/subjects.set", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-atom-token": "atom_token_1",
				[ATOM_CUSTOMER_ID_HEADER]: "cus_1",
			},
			body,
		});
		const otherSecret = await a.peerApp.request("/v1/subjects.set", {
			...signed({ path: "/v1/subjects.set", body, customerId: "cus_1" }),
			headers: peerRequestHeaders({
				secret: "q".repeat(64),
				method: "POST",
				path: "/v1/subjects.set",
				customerId: "cus_1",
				body,
				headers: { [ATOM_CUSTOMER_ID_HEADER]: "cus_1" },
			}),
		});
		const ours = await a.peerApp.request(
			"/v1/subjects.set",
			signed({ path: "/v1/subjects.set", body, customerId: "cus_1" }),
		);

		expect(withToken.status).toBe(401);
		expect(otherSecret.status).toBe(401);
		expect(ours.status).toBe(200);
	});
});

describe("F6: the catalog is caught up", () => {
	test("a replica catching up takes the peer's newer catalog", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [] });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect({ replicas: [a, b] });
		const rows = createCatalogRowsFor({ state: createState() });
		await a.slots.setCatalog({ rows, readAt: 1_700 });

		await b.sync().catchUp();

		expect(b.slots.installCatalog({ rows: [], readAt: 1_699 })).toBe(false);
	});
});

describe("F7: only a ready peer is a source", () => {
	test("a replica that is not ready answers since with 503, and a replica catching up skips it", async () => {
		const a = createReplica({ address: "10.0.0.1", peers: [], ready: false });
		const c = createReplica({ address: "10.0.0.3", peers: [] });
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1", "10.0.0.3"],
		});
		connect({ replicas: [a, b, c] });
		await storeOnly({ replica: a, customerId: "cus_1", readAt: 1_000 });
		await storeOnly({ replica: c, customerId: "cus_2", readAt: 1_000 });

		const reply = await a.peerApp.request(
			"/v1/_peer/subjects.since",
			signed({ path: "/v1/_peer/subjects.since", body: sinceBody }),
		);
		await b.sync().catchUp();

		expect(reply.status).toBe(503);
		expect(await heldEverywhere(b)).toEqual(["cus_2"]);
	});
});

describe("F8: the catch-up window is in apply time, not Autumn's read time", () => {
	test("a push read long ago but applied on the peer after this replica's newest write is copied", async () => {
		const [kept, late] = customersInSlot({ slot: 0, count: 2 }) as [
			string,
			string,
		];
		let now = 100_000;
		const a = createReplica({ address: "10.0.0.1", peers: [], now: () => now });
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			now: () => now,
		});
		connect({ replicas: [a, b] });
		// b holds a read at 100 s; a applies, later, a push Autumn read at 10 s (delayed > 60 s on its way).
		await storeOnly({ replica: b, customerId: kept, readAt: 100_000 });
		await storeOnly({ replica: a, customerId: kept, readAt: 100_000 });
		now = 130_000;
		await storeOnly({ replica: a, customerId: late, readAt: 10_000 });
		now = 140_000;

		await b.sync().catchUp();

		expect(await heldIds({ replica: b, slot: 0 })).toContain(late);
	});
});

describe("F10: a refusal that is not the body's fault is tried again", () => {
	test("a 401 from a peer is not counted as delivered; only a body the peer could never apply is", async () => {
		const send = createPeerSender({
			ctx: { secret: PEER_SECRET, port: PEER_PORT },
		});
		const operation = { kind: "subjects.set", key: "cus_1", body: "{}" };
		const outcomes: string[] = [];
		for (const status of [401, 429, 503, 400, 422, 200]) {
			spyOn(globalThis, "fetch").mockResolvedValue(
				new Response("", { status }),
			);
			outcomes.push(
				await send({ peer: "10.0.0.2", path: "/v1/subjects.set", operation }),
			);
		}

		expect(outcomes).toEqual([
			"failed",
			"failed",
			"failed",
			"rejected",
			"rejected",
			"delivered",
		]);
	});
});

describe("F11: what waits for a peer is bounded in bytes", () => {
	test("past the byte budget the oldest copy is dropped and counted", async () => {
		const counts: Record<string, number> = {};
		const outbox = createPeerOutbox({
			ctx: {
				resolver: { peers: async () => ["10.0.0.2"], forget: () => {} },
				send: () => new Promise(() => {}),
				counters: {
					add: (field) => void (counts[field] = (counts[field] ?? 0) + 1),
				},
				logger: { warn: () => {} },
				sleep: async () => {},
				now: () => 0,
			},
		});
		const body = "x".repeat(10 * 1024 * 1024);
		for (let i = 0; i < 12; i++)
			await outbox.enqueue({
				operation: { kind: "subjects.set", key: `cus_${i}`, body },
				path: "/v1/subjects.set",
			});

		// Four in flight, the rest waiting: 12 × 10 MB queued against a 64 MB budget drops the oldest waiting ones.
		expect(counts.relayDropped).toBeGreaterThan(0);
	});
});

describe("catch-up window edge", () => {
	test("a row written exactly at the edge of the window asked for is copied", async () => {
		const [kept, edge] = customersInSlot({ slot: 0, count: 2 }) as [
			string,
			string,
		];
		let now = 100_000;
		const a = createReplica({ address: "10.0.0.1", peers: [], now: () => now });
		const b = createReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			now: () => now,
		});
		connect({ replicas: [a, b] });
		await storeOnly({ replica: b, customerId: kept, readAt: 100_000 });
		await storeOnly({ replica: a, customerId: kept, readAt: 100_000 });
		// b asks for the peer's writes in its last (downtime + hold + margin) ms; this one sits exactly on that edge.
		now = 200_000;
		const sync = b.sync();
		const windowStart = 200_000 - (200_000 - 100_000 + 5 * 60_000 + 60_000);
		now = windowStart;
		await storeOnly({ replica: a, customerId: edge, readAt: 50_000 });
		now = 200_000;

		await sync.catchUp();

		expect(await heldIds({ replica: b, slot: 0 })).toContain(edge);
	});
});

describe("N2: a customer's view and its entities' are distinct in the outbox", () => {
	test("a push for one entity does not replace a waiting push for another of the same customer", async () => {
		const sent: string[] = [];
		const a = createReplica({ address: "10.0.0.1", peers: ["10.0.0.2"] });
		a.replication.replicate = (operation) => void sent.push(operation.key);
		const customerView = subjectPushOf({
			subject: storedSubjectWith({ balance: 10 }),
		});
		const entityView = subjectPushOf({
			subject: storedEntitySubjectWith({
				customerBalance: 10,
				entityBalance: 5,
			}),
		});

		for (const push of [customerView, entityView])
			await a.app.request("/v1/subjects.set", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-atom-token": ATOM_TOKEN,
					[ATOM_CUSTOMER_ID_HEADER]: push.customerId,
				},
				body: push.body,
			});

		expect(sent).toEqual(["cus_1\u0000", "cus_1\u0000ent_42"]);
	});
});
