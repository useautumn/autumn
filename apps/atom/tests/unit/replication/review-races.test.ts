import { afterEach, describe, expect, test } from "bun:test";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { LATEST_VERSION } from "@autumn/shared";
import { createPeerOutbox } from "../../../src/replication/outbox/createPeerOutbox.js";
import { peerRequestHeaders } from "../../../src/replication/transport/peerSignature.js";
import {
	ATOM_TOKEN,
	bodyFor,
	cleanUpReplicas,
	connect,
	createReplica,
	customersInSlot,
	disconnect,
	heldIds,
	PEER_SECRET,
	storeOnly,
} from "./replicaFixtures.js";

afterEach(() => {
	disconnect();
	cleanUpReplicas();
});

describe("catch-up races (review of #4605)", () => {
	test("a live relay that lands before catch-up must not move the catch-up cursor past what the replica missed", async () => {
		const [kept, missed, live] = customersInSlot({ slot: 0, count: 3 }) as [
			string,
			string,
			string,
		];
		let now = 1_000;
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

		// b held `kept` before it went down; while it was down (> 60 s), a stored `missed` and its relay to b was dropped.
		await storeOnly({ replica: b, customerId: kept, readAt: 1_000 });
		await storeOnly({ replica: a, customerId: kept, readAt: 1_000 });
		now = 50_000;
		await storeOnly({ replica: a, customerId: missed, readAt: 50_000 });
		now = 200_000;
		// b's boot: the point it fell behind at is fixed before it listens.
		const sync = b.sync();
		// b listens before it catches up, so a fresh push relayed by a lands first.
		const liveBody = bodyFor({ customerId: live, readAt: 200_000 });
		const relayed = await b.peerApp.request("/v1/subjects.set", {
			method: "POST",
			headers: peerRequestHeaders({
				secret: PEER_SECRET,
				method: "POST",
				path: "/v1/subjects.set",
				customerId: live,
				body: liveBody,
				headers: { [ATOM_CUSTOMER_ID_HEADER]: live },
			}),
			body: liveBody,
		});
		expect(relayed.status).toBe(200);

		await sync.catchUp();

		expect(await heldIds({ replica: b, slot: 0 })).toContain(missed);
	});

	test("a page boundary between two subjects written in the same millisecond copies both", async () => {
		const ids = customersInSlot({ slot: 0, count: 501 });
		let now = 1_000;
		const a = createReplica({ address: "10.0.0.1", peers: [], now: () => now });
		const b = createReplica({ address: "10.0.0.2", peers: ["10.0.0.1"] });
		connect({ replicas: [a, b] });
		// 499 distinct writes, then two customers written in the same ms: rows 500 and 501 tie on applied_at.
		for (const [i, customerId] of ids.entries()) {
			now = i < 499 ? 1_000 + i : 9_000;
			await storeOnly({ replica: a, customerId, readAt: now });
		}

		await b.sync().catchUp();

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

		const reply = await b.app.request("/v1/balances.check", sendEventCheck());
		await Bun.sleep(3_000);

		expect(reply.status).toBe(504);
		expect(await reply.json()).toMatchObject({ code: "atom_peer_timeout" });
		expect(autumnCalls).toBe(1);
	}, 10_000);
});

describe("not-ready proxy: a reply lost on the way back", () => {
	test("a check that sends an event reaches Autumn once when the ready peer's reply is lost after it answered", async () => {
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
			replyFrom: async (replica, reply) => {
				if (replica !== a) return reply;
				throw Object.assign(new TypeError("read ECONNRESET"), {
					code: "ECONNRESET",
				});
			},
		});

		const reply = await b.app.request("/v1/balances.check", sendEventCheck());

		expect(reply.status).toBe(504);
		expect(autumnCalls).toBe(1);
	});
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
					return "failed";
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
