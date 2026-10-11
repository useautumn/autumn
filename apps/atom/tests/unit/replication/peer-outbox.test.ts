import { describe, expect, test } from "bun:test";
import type { PeerResolver } from "../../../src/replication/discovery/createPeerResolver.js";
import { createPeerOutbox } from "../../../src/replication/outbox/createPeerOutbox.js";
import type { ReplicatedOperation } from "../../../src/replication/types/replicatedOperation.js";

type Delivery = { peer: string; path: string; operation: ReplicatedOperation };

/** A peer that answers as told, per call; `true` once the script runs out. */
const outboxOf = ({
	peers,
	answers = {},
}: {
	peers: string[];
	answers?: Record<string, boolean[]>;
}) => {
	const delivered: Delivery[] = [];
	const counts: Record<string, number> = {};
	let known = peers;
	let forgotten = 0;
	let now = 0;
	const resolver: PeerResolver = {
		peers: async () => known,
		forget: () => {
			forgotten++;
		},
	};
	const outbox = createPeerOutbox({
		ctx: {
			resolver,
			send: async (delivery) => {
				delivered.push(delivery);
				return answers[delivery.peer]?.shift() ?? true;
			},
			counters: {
				add: (field, by = 1) => {
					counts[field] = (counts[field] ?? 0) + by;
				},
			},
			logger: { warn: () => {} },
			sleep: async () => {},
			now: () => now,
		},
	});
	return {
		outbox,
		delivered,
		counts,
		forgotten: () => forgotten,
		setPeers: (next: string[]) => {
			known = next;
		},
		advance: (ms: number) => {
			now += ms;
		},
	};
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const push = ({
	key,
	body = `{"${key}"}`,
}: {
	key: string;
	body?: string;
}): ReplicatedOperation => ({
	kind: "subjects.set",
	key,
	body,
	headers: { "x-atom-customer-id": key },
});

describe("what a thread applied, on its way to the other replicas", () => {
	test("goes to every peer, once each, and is counted", async () => {
		const { outbox, delivered, counts } = outboxOf({
			peers: ["10.0.0.2", "10.0.0.3"],
		});

		await outbox.enqueue({
			operation: push({ key: "cus_1" }),
			path: "/v1/subjects.set",
		});
		await settle();

		expect(
			delivered.map(({ peer, path, operation }) => [peer, path, operation.key]),
		).toEqual([
			["10.0.0.2", "/v1/subjects.set", "cus_1"],
			["10.0.0.3", "/v1/subjects.set", "cus_1"],
		]);
		expect(counts).toEqual({ relayed: 2 });
	});

	test("goes nowhere while there is no peer", async () => {
		const { outbox, delivered, counts } = outboxOf({ peers: [] });

		await outbox.enqueue({
			operation: push({ key: "cus_1" }),
			path: "/v1/subjects.set",
		});
		await settle();

		expect(delivered).toEqual([]);
		expect(counts).toEqual({});
	});

	test("is tried again after a failed delivery, and the peers are resolved again in case one was replaced", async () => {
		const { outbox, delivered, counts, forgotten } = outboxOf({
			peers: ["10.0.0.2"],
			answers: { "10.0.0.2": [false, true] },
		});

		await outbox.enqueue({
			operation: push({ key: "cus_1" }),
			path: "/v1/subjects.set",
		});
		await settle();

		expect(delivered.map(({ operation }) => operation.key)).toEqual([
			"cus_1",
			"cus_1",
		]);
		expect(counts).toEqual({ relayFailed: 1, relayed: 1 });
		expect(forgotten()).toBe(1);
	});

	test("a newer copy for the same key replaces the one still waiting, so a peer never gets an older one last", async () => {
		const { outbox, delivered } = outboxOf({
			peers: ["10.0.0.2"],
			answers: { "10.0.0.2": [false, true, true] },
		});

		await outbox.enqueue({
			operation: push({ key: "cus_1", body: "v1" }),
			path: "/v1/subjects.set",
		});
		await outbox.enqueue({
			operation: push({ key: "cus_1", body: "v2" }),
			path: "/v1/subjects.set",
		});
		await outbox.enqueue({
			operation: push({ key: "cus_2", body: "v1" }),
			path: "/v1/subjects.set",
		});
		await settle();

		const stored = delivered
			.filter((_, i) => i > 0)
			.map(({ operation }) => `${operation.key}:${operation.body}`);
		expect(stored).toEqual(["cus_1:v2", "cus_2:v1"]);
	});

	test("a copy a peer never took within the hold is dropped and counted; the peer's own catch-up covers it", async () => {
		const { outbox, delivered, counts, advance } = outboxOf({
			peers: ["10.0.0.2"],
			answers: { "10.0.0.2": [false, false] },
		});

		await outbox.enqueue({
			operation: push({ key: "cus_1" }),
			path: "/v1/subjects.set",
		});
		advance(5 * 60_000 + 1);
		await settle();

		expect(delivered.length).toBe(2);
		expect(counts).toEqual({ relayFailed: 2, relayDropped: 1 });
	});

	test("a peer that left the service takes its waiting copies with it", async () => {
		const { outbox, delivered, counts, setPeers } = outboxOf({
			peers: ["10.0.0.2"],
			answers: { "10.0.0.2": [false] },
		});

		await outbox.enqueue({
			operation: push({ key: "cus_1" }),
			path: "/v1/subjects.set",
		});
		setPeers([]);
		await settle();

		expect(delivered.length).toBe(1);
		expect(counts).toEqual({ relayFailed: 1 });
	});

	test("after stop nothing more is queued or sent", async () => {
		const { outbox, delivered } = outboxOf({ peers: ["10.0.0.2"] });
		outbox.stop();

		await outbox.enqueue({
			operation: push({ key: "cus_1" }),
			path: "/v1/subjects.set",
		});
		await settle();

		expect(delivered).toEqual([]);
	});
});
