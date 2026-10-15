/**
 * A planned ownership move between two replicas (handoffs/atom-replica-handover-design.md): the leaving replica announces
 * itself, the survivor owns its customers at once, and the leaving replica's public port keeps answering by hopping.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { LATEST_VERSION } from "@autumn/shared";
import { createJournalForwarder } from "../../../src/journalForwarder/createJournalForwarder.js";
import { createReplicaRing } from "../../../src/replicas/createReplicaRing.js";
import { PEER_ANNOUNCEMENT_PATH } from "../../../src/replicas/handover/announcementContract.js";
import { PEER_HANDOFF_PATH } from "../../../src/replicas/handover/handoffContract.js";
import { KEYS_RELAY } from "../../../src/replication/keys/createKeyRelay.js";
import { peerRequestHeaders } from "../../../src/replication/transport/peerSignature.js";
import {
	ATOM_TOKEN,
	bodyFor,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	PEER_PORT,
	PEER_SECRET,
	quiet,
	recordJournals,
	storeOnly,
} from "../replication/replicaFixtures.js";
import { until } from "../utils/fakeAutumnTracks.js";

afterEach(() => {
	disconnect();
	cleanUpReplicas();
});

const A = "10.0.0.1";
const B = "10.0.0.2";
/** Owned by A among {A, B}. */
const CUSTOMER = "cus_1";

const checkFor = ({
	customerId,
	sendEvent = false,
}: {
	customerId: string;
	sendEvent?: boolean;
}) => ({
	method: "POST",
	headers: {
		"content-type": "application/json",
		authorization: "Bearer am_sk_test_1",
		"x-atom-token": ATOM_TOKEN,
		"x-api-version": LATEST_VERSION,
	},
	body: JSON.stringify({
		customer_id: customerId,
		feature_id: "messages",
		send_event: sendEvent,
	}),
});

const countingAutumn = () => {
	const calls: string[] = [];
	return {
		calls,
		autumn: async (request: Request) => {
			calls.push(new URL(request.url).pathname);
			return Response.json({});
		},
	};
};

/** An Autumn that takes nothing yet: what A journals stays owed and unsent, as during a hand-in outage. */
const holdingAutumn = () =>
	createJournalForwarder({
		ctx: {
			autumnClient: { appendTracks: () => new Promise(() => {}) },
			logger: quiet,
		},
	});

type Forwarder = ReturnType<typeof holdingAutumn>;
type Replica = ReturnType<typeof createReplica>;

/** Two replicas that agree on the ring and both hold CUSTOMER at 10; A owns it. */
const agreeingPair = async ({
	aForwarder = holdingAutumn(),
	bForwarder = holdingAutumn(),
}: {
	aForwarder?: Forwarder;
	bForwarder?: Forwarder;
} = {}) => {
	const a = createReplica({
		address: A,
		peers: [B],
		ringPeers: [B],
		journalForwarder: aForwarder,
	});
	const b = createReplica({
		address: B,
		peers: [A],
		ringPeers: [A],
		journalForwarder: bForwarder,
	});
	for (const replica of [a, b])
		await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
	return { a, b };
};

/** The replica deducts `times` on the customer itself: that many entries owed in its journal. */
const deductOn = async ({
	replica,
	times,
	customerId = CUSTOMER,
}: {
	replica: Replica;
	times: number;
	customerId?: string;
}) => {
	for (let i = 0; i < times; i++) {
		const reply = await replica.app.request(
			"/v1/balances.check",
			checkFor({ customerId, sendEvent: true }),
		);
		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		expect(reply.headers.get("x-atom-proxied")).toBeNull();
	}
};
const deductOnA = ({ a, times }: { a: Replica; times: number }) =>
	deductOn({ replica: a, times });

/** The subject as Autumn pushes it once its worker applied a lock's track: the writer's seq seen, the lock open. */
const appliedLockBodyFor = ({
	customerId,
	readAt,
	balance,
	writerSeqs,
	openLock,
}: {
	customerId: string;
	readAt: number;
	balance: number;
	writerSeqs: Record<string, number>;
	openLock: { id: string; lock_id: string };
}) => {
	const body = JSON.parse(bodyFor({ customerId, readAt, balance })) as {
		state: { customer: Record<string, unknown>; openLocks?: unknown[] };
	};
	body.state.customer.atom_seqs = { atom_1: writerSeqs };
	body.state.openLocks = [openLock];
	return JSON.stringify(body);
};

const journalOwing = (replica: Replica, customerId = CUSTOMER) =>
	replica.slots
		.ownedJournals()
		.find((journal) => journal.owed({ customerId }).length > 0);

const owedSeqs = (replica: Replica, customerId = CUSTOMER) =>
	journalOwing(replica, customerId)
		?.owed({ customerId })
		.map(({ seq }) => seq) ?? [];

const remainingAt = async (replica: Replica) =>
	(
		await (
			await replica.app.request(
				"/v1/balances.check",
				checkFor({ customerId: CUSTOMER }),
			)
		).json()
	).balance.remaining as number;

/** A network that treats the handoff route specially: holds it on the way, or loses its reply on the way back. */
const handoffNetwork = ({
	replicas,
	holdMs = 0,
	loseReply = false,
}: {
	replicas: Replica[];
	holdMs?: number;
	loseReply?: boolean;
}) => {
	const isHandoff = (request: Request) =>
		new URL(request.url).pathname === PEER_HANDOFF_PATH;
	connect({
		replicas,
		beforeDispatch: async (request) => {
			if (isHandoff(request) && holdMs > 0) await Bun.sleep(holdMs);
		},
		replyFrom: async (_replica, reply, request) =>
			loseReply && isHandoff(request)
				? new Response(null, { status: 502 })
				: reply,
	});
};

/** Autumn as the journal sees it: down until `up()`, then every track it takes, as writer/seq. */
const toggledAutumn = () => {
	let down = true;
	const taken: string[] = [];
	const forwarder = createJournalForwarder({
		ctx: {
			autumnClient: {
				appendTracks: async ({ tracks }) => {
					if (down) throw new Error("Autumn is down");
					for (const track of tracks)
						taken.push(`${track.writerId}/${track.seq}`);
				},
			},
			logger: quiet,
			sleep: async () => {},
		},
	});
	return {
		forwarder,
		taken,
		up: () => {
			down = false;
		},
	};
};

describe("a replica leaving the ring", () => {
	test("H1: a hop reaching it after it announced leaving is refused as leaving, and the sender answers the customer itself", async () => {
		const autumn = countingAutumn();
		const { a, b } = await agreeingPair();
		connect({ replicas: [a, b], autumn: autumn.autumn });
		a.membership.leaveSelf();

		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER }),
		);

		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-proxied")).toBeNull();
		expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		expect((await reply.json()).balance.remaining).toBe(10);
		expect(autumn.calls).toEqual([]);
		// The refusal told B what the announcement would have.
		expect(b.membership.isLeaving(A)).toBe(true);
	});

	test("announces itself to its peers, which own its customers from then on without asking the API", async () => {
		const autumn = countingAutumn();
		const { a, b } = await agreeingPair();
		connect({ replicas: [a, b], autumn: autumn.autumn });

		await a.leave();

		expect(b.membership.isMember(A)).toBe(false);
		expect(await b.ring.ownerOf({ customerId: CUSTOMER })).toBe(B);
		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);
		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-proxied")).toBeNull();
		expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		expect(autumn.calls).toEqual([]);
	});

	test("keeps its public port answering: a check arriving while it leaves is handed to the new owner, never a 503", async () => {
		const autumn = countingAutumn();
		const { a, b } = await agreeingPair();
		connect({ replicas: [a, b], autumn: autumn.autumn });
		await a.leave();

		const reply = await a.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);

		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-proxied")).toBe("owner");
		expect((await reply.json()).balance.remaining).toBe(9);
		expect(autumn.calls).toEqual([]);
	});

	test("refuses a hop on its peer port as leaving, which an older sender takes as unavailable", async () => {
		const { a, b } = await agreeingPair();
		connect({ replicas: [a, b] });
		a.membership.leaveSelf();
		const check = checkFor({ customerId: CUSTOMER });

		const reply = await a.peerApp.request("/v1/balances.check", {
			...check,
			headers: peerRequestHeaders({
				secret: PEER_SECRET,
				method: "POST",
				path: "/v1/balances.check",
				body: check.body,
				headers: check.headers,
			}),
		});

		expect(reply.status).toBe(503);
		expect((await reply.json()).code).toBe("atom_leaving");
	});

	test("H7: with its peer unreachable it still leaves; the peer's ring drops it only when the service name does", async () => {
		const autumn = countingAutumn();
		const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
		await storeOnly({ replica: a, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a], autumn: autumn.autumn });

		await a.leave();

		expect(a.membership.isSelfLeaving()).toBe(true);
		// Owner of nothing with nobody to hand to: the API answers, as today.
		const reply = await a.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER }),
		);
		expect(reply.headers.get("x-atom-forwarded")).toBe("owner_unavailable");
		expect(autumn.calls).toEqual(["/v1/balances.check"]);
	});

	test("names, before it leaves, the member that takes each of its customers, and nobody when it is alone", async () => {
		const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
		expect(await a.ring.ownerOf({ customerId: CUSTOMER })).toBe(A);
		expect(await a.ring.ownerWithout({ customerId: CUSTOMER, member: A })).toBe(
			B,
		);

		const alone = createReplica({ address: A, peers: [], ringPeers: [] });
		expect(
			await alone.ring.ownerWithout({ customerId: CUSTOMER, member: A }),
		).toBe(null);
	});
});

describe("the leaving replica's owed entries", () => {
	test("are copied to the new owner under their own writer and seq: its view holds them and it hands them in, and the old owner keeps sending its own in order", async () => {
		const journals = recordJournals();
		const { a, b } = await agreeingPair({ bForwarder: journals.forwarder });
		connect({ replicas: [a, b] });
		await deductOnA({ a, times: 2 });
		const aJournal = journalOwing(a);
		if (!aJournal) throw new Error("A owes its two entries");

		await a.leave();

		expect(await remainingAt(b)).toBe(8);
		// Nothing leaves the sender on the ack: its forwarder sends 1 then 2 as before, so no later seq of its can ever land ahead of them.
		expect(
			aJournal.owed({ customerId: CUSTOMER }).map(({ seq }) => seq),
		).toEqual([1, 2]);
		expect(aJournal.unsent({ limit: 10 }).map(({ seq }) => seq)).toEqual([
			1, 2,
		]);
		const held = journalOwing(b)?.owed({ customerId: CUSTOMER }) ?? [];
		expect(held.map(({ writerId, seq }) => ({ writerId, seq }))).toEqual([
			{ writerId: aJournal.writerId, seq: 1 },
			{ writerId: aJournal.writerId, seq: 2 },
		]);
		await until(() => journals.appended.length === 2);
		expect(journals.appended.map(({ writer }) => writer)).toEqual([
			aJournal.writerId,
			aJournal.writerId,
		]);
	});

	test("H2: an entry the new owner journaled before the handoff landed keeps its place: the view replays by when each was granted", async () => {
		const { a, b } = await agreeingPair();
		connect({ replicas: [a, b] });
		await deductOnA({ a, times: 2 });
		// B took over on the announcement and deducted once before A's entries arrived.
		b.membership.markLeaving(A);
		const own = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);
		expect((await own.json()).balance.remaining).toBe(9);

		await a.leave();

		expect(await remainingAt(b)).toBe(7);
		const bJournal = journalOwing(b);
		const held = bJournal?.owed({ customerId: CUSTOMER }) ?? [];
		expect(held.map(({ seq }) => seq)).toEqual([1, 2, 1]);
		expect(held[2]?.writerId).toBe(bJournal?.writerId ?? "");
	});

	test("H3: a handoff whose ack is lost leaves the entries on both sides, sent twice under one writer and seq: Autumn's watermark takes them once", async () => {
		const aAutumn = toggledAutumn();
		const bAutumn = toggledAutumn();
		bAutumn.up();
		const { a, b } = await agreeingPair({
			aForwarder: aAutumn.forwarder,
			bForwarder: bAutumn.forwarder,
		});
		handoffNetwork({ replicas: [a, b], loseReply: true });
		await deductOnA({ a, times: 2 });
		const writer = journalOwing(a)?.writerId;

		await a.leave();
		// B holds them and hands them in; A never saw the ack, keeps them, and drains them once Autumn is back.
		await until(() => bAutumn.taken.length === 2);
		aAutumn.up();
		await until(() => aAutumn.taken.length === 2);

		const keys = [...aAutumn.taken, ...bAutumn.taken];
		expect(keys).toHaveLength(4);
		expect(new Set(keys).size).toBe(2);
		expect(keys.every((key) => key.startsWith(`${writer}/`))).toBe(true);
	});
});

describe("a moved customer's first requests", () => {
	test("H5: a moved customer's first request waits for its handoff and, past the barrier, goes on without it", async () => {
		const { a, b } = await agreeingPair();
		await deductOnA({ a, times: 2 });
		handoffNetwork({ replicas: [a, b], holdMs: 200 });

		const leaving = a.leave();
		await until(() => b.membership.isLeaving(A));
		const startedAt = performance.now();
		const late = await remainingAt(b);
		const waitedMs = performance.now() - startedAt;
		await leaving;

		expect(late).toBe(10);
		expect(waitedMs).toBeGreaterThanOrEqual(45);
		expect(b.stats().handoffLate).toBe(1);
		expect(await remainingAt(b)).toBe(8);
	});

	test("a moved customer that owed nothing is answered at once, once the leaver has said it handed everything", async () => {
		const { a, b } = await agreeingPair();
		connect({ replicas: [a, b] });

		await a.leave();
		const startedAt = performance.now();
		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER }),
		);
		const waitedMs = performance.now() - startedAt;

		expect((await reply.json()).balance.remaining).toBe(10);
		expect(waitedMs).toBeLessThan(40);
		expect(b.membership.isHandoffComplete(A)).toBe(true);
		expect(b.stats().handoffLate).toBe(0);
	});

	test("a moved customer's first request inside the barrier is answered with the handed entries", async () => {
		const { a, b } = await agreeingPair();
		await deductOnA({ a, times: 2 });
		handoffNetwork({ replicas: [a, b], holdMs: 20 });

		const leaving = a.leave();
		await until(() => b.membership.isLeaving(A));
		const first = await remainingAt(b);
		await leaving;

		expect(first).toBe(8);
		expect(b.stats().handoffLate).toBe(0);
	});
});

describe("a replica leaving with nobody to hand to", () => {
	test("H4: its peer is down: the announcement and the handoff fail, and the entries drain to Autumn as today", async () => {
		const aAutumn = toggledAutumn();
		aAutumn.up();
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			journalForwarder: aAutumn.forwarder,
		});
		await storeOnly({ replica: a, customerId: CUSTOMER, readAt: 1700 });
		connect({
			replicas: [a],
			autumn: async () => new Response(null, { status: 503 }),
		});
		// Deducted while Autumn held nothing: journaled, unsent.
		connect({ replicas: [a] });
		await deductOnA({ a, times: 2 });
		await until(() => aAutumn.taken.length === 2);
		const writer = journalOwing(a)?.writerId;
		aAutumn.taken.length = 0;

		await a.leave();

		expect(a.membership.isSelfLeaving()).toBe(true);
		// Nothing moved: the entries are still A's, owed until a push shows them applied.
		expect(journalOwing(a)?.owed({ customerId: CUSTOMER })).toHaveLength(2);
		expect(writer).toBeDefined();
	});

	test("H8: both replicas leave at once: neither takes the other's entries, and each drains its own to Autumn", async () => {
		const aAutumn = toggledAutumn();
		const bAutumn = toggledAutumn();
		const { a, b } = await agreeingPair({
			aForwarder: aAutumn.forwarder,
			bForwarder: bAutumn.forwarder,
		});
		connect({ replicas: [a, b] });
		await deductOnA({ a, times: 2 });
		const writer = journalOwing(a)?.writerId;

		await Promise.all([a.leave(), b.leave()]);
		aAutumn.up();
		bAutumn.up();
		await until(() => aAutumn.taken.length + bAutumn.taken.length >= 2);

		const keys = [...aAutumn.taken, ...bAutumn.taken];
		expect(new Set(keys)).toEqual(new Set([`${writer}/1`, `${writer}/2`]));
		expect(a.membership.isSelfLeaving()).toBe(true);
		expect(b.membership.isSelfLeaving()).toBe(true);
	});
});

describe("a replica joining the ring", () => {
	test("H6: a listed peer that answers ready is counted first, then granted and handed its customers' entries once: a check for them hops to it and sees them", async () => {
		const bAutumn = toggledAutumn();
		const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
		const b = createReplica({
			address: B,
			peers: [A],
			ringPeers: [A],
			joined: [],
			journalForwarder: bAutumn.forwarder,
		});
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b] });
		// B owned everything while A was away and deducted twice on CUSTOMER.
		await deductOn({ replica: b, times: 2 });
		expect(await b.ring.ownerOf({ customerId: CUSTOMER })).toBe(B);

		await b.probeOnce();

		expect(b.membership.isMember(A)).toBe(true);
		expect(a.membership.isGrantedBy(B)).toBe(true);
		expect(a.membership.isHandoffComplete(B)).toBe(true);
		// B keeps what it copied to A and hands it in itself; A holds the copies for its view.
		expect(owedSeqs(b)).toEqual([1, 2]);
		expect(owedSeqs(a)).toEqual([1, 2]);
		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER }),
		);
		expect(reply.headers.get("x-atom-proxied")).toBe("owner");
		expect((await reply.json()).balance.remaining).toBe(8);
	});

	test("a listed peer that is not ready yet is not counted and gets nothing", async () => {
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			ready: false,
		});
		const b = createReplica({
			address: B,
			peers: [A],
			ringPeers: [A],
			joined: [],
		});
		connect({ replicas: [a, b] });

		await b.probeOnce();

		expect(b.membership.stateOf(A)).toBeNull();
		expect(await b.ring.ownerOf({ customerId: CUSTOMER })).toBe(B);
	});

	test("A1: a peer the service name lists owns nothing until it has answered ready: the flip is one shared store", async () => {
		const b = createReplica({
			address: B,
			peers: [A],
			ringPeers: [A],
			joined: [],
		});

		expect(await b.ring.ownerOf({ customerId: CUSTOMER })).toBe(B);
		b.membership.markJoined({ address: A, boot: "boot-1" });
		expect(await b.ring.ownerOf({ customerId: CUSTOMER })).toBe(A);
	});

	test("a leaving peer is counted again once it is back and ready", async () => {
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		b.membership.markLeaving(A);
		expect(await b.ring.ownerOf({ customerId: CUSTOMER })).toBe(B);

		b.membership.markJoined({ address: A, boot: "boot-2" });

		expect(b.membership.stateOf(A)).toBe("joined");
		expect(await b.ring.ownerOf({ customerId: CUSTOMER })).toBe(A);
	});
});

/** Owned by GONE among {B, GONE} and by A among {A, B}: it moves to B when GONE leaves, and on to A when A joins. */
const GONE = "10.0.0.9";
const twiceMovedCustomer = async () => {
	const ringOf = (peers: string[]) =>
		createReplicaRing({
			ctx: { resolver: { peers: async () => peers }, own: () => [B] },
		});
	const viaGone = ringOf([GONE]);
	const viaA = ringOf([A]);
	for (let i = 0; i < 1_000; i++) {
		const customerId = `cus_moved_${i}`;
		if (
			(await viaGone.ownerOf({ customerId })) === GONE &&
			(await viaA.ownerOf({ customerId })) === A
		)
			return customerId;
	}
	throw new Error("no customer id moves twice");
};

describe("ownership changes hands by grant: the old owner stops first, the new one answers once told", () => {
	test("a booting replica answers no public request itself until the peer it took the customer from has granted it", async () => {
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			joined: [],
		});
		const b = createReplica({
			address: B,
			peers: [A],
			ringPeers: [A],
			joined: [],
		});
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b] });
		// A counts B, so CUSTOMER is A's by its own ring; B has not said so yet.
		a.membership.markJoined({ address: B, boot: "fixture" });

		const before = await a.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);
		expect(before.status).toBe(200);
		expect(before.headers.get("x-atom-proxied")).toBe("owner");
		expect(owedSeqs(b)).toEqual([1]);
		expect(owedSeqs(a)).toEqual([]);

		// B notices A ready: counts it, grants it, hands it the one entry.
		await b.probeOnce();

		const after = await a.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);
		expect(after.status).toBe(200);
		expect(after.headers.get("x-atom-proxied")).toBeNull();
		expect((await after.json()).balance.remaining).toBe(8);
		expect(owedSeqs(b)).toEqual([1]);
	});

	test("a straggler on the stand-in after the flip is re-hopped to the new owner, not journaled", async () => {
		const customerId = await twiceMovedCustomer();
		const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
		const b = createReplica({
			address: B,
			peers: [A],
			ringPeers: [A, GONE],
			joined: [],
		});
		for (const replica of [a, b])
			await storeOnly({ replica, customerId, readAt: 1700 });
		connect({ replicas: [a, b] });
		// GONE is leaving: the customer is B's, and its first request on B waits a little for GONE's handoff.
		b.membership.markLeaving(GONE);

		const straggler = b.app.request(
			"/v1/balances.check",
			checkFor({ customerId, sendEvent: true }),
		);
		await Bun.sleep(5);
		// While it waits, A joins: the customer is A's now.
		await b.probeOnce();
		expect(await b.ring.ownerOf({ customerId })).toBe(A);

		const reply = await straggler;
		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-proxied")).toBe("owner");
		expect(owedSeqs(b, customerId)).toEqual([]);
		expect(owedSeqs(a, customerId)).toEqual([1]);
	});

	test("the leaver grants and hands to a ready peer it never counted", async () => {
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			joined: [],
		});
		const b = createReplica({
			address: B,
			peers: [A],
			ringPeers: [A],
			joined: [],
		});
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b] });
		await deductOn({ replica: b, times: 2 });

		await b.leave();

		expect(a.membership.isLeaving(B)).toBe(true);
		expect(owedSeqs(a)).toEqual([1, 2]);
		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER }),
		);
		expect(reply.headers.get("x-atom-proxied")).toBe("owner");
		expect((await reply.json()).balance.remaining).toBe(8);
	});

	test("a request the stand-in hops over before its announcement lands still waits for the handoff: the hop names where the customer came from", async () => {
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			joined: [],
		});
		const b = createReplica({
			address: B,
			peers: [A],
			ringPeers: [A],
			joined: [],
		});
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b] });
		await deductOn({ replica: b, times: 2 });
		// A has probed B; B's announcements never reach A and its handoff is slow on the way.
		a.membership.markJoined({ address: B, boot: "fixture" });
		disconnect();
		connect({
			replicas: [a, b],
			beforeDispatch: async (request) => {
				const { pathname } = new URL(request.url);
				if (pathname === PEER_ANNOUNCEMENT_PATH)
					throw Object.assign(new TypeError("connect ECONNREFUSED"), {
						code: "ECONNREFUSED",
					});
				if (pathname === PEER_HANDOFF_PATH) await Bun.sleep(20);
			},
		});

		const joining = b.probeOnce();
		await Bun.sleep(1);
		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER }),
		);
		await joining;

		expect(reply.headers.get("x-atom-proxied")).toBe("owner");
		expect((await reply.json()).balance.remaining).toBe(8);
		expect(owedSeqs(a)).toEqual([1, 2]);
	});
});

describe("a lock taken on the leaving owner", () => {
	const lockCall = (body: Record<string, unknown>) => ({
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: "Bearer am_sk_test_1",
			"x-atom-token": ATOM_TOKEN,
			"x-api-version": LATEST_VERSION,
		},
		body: JSON.stringify(body),
	});
	const lockOn = (replica: Replica) =>
		replica.app.request(
			"/v1/balances.check",
			lockCall({
				customer_id: CUSTOMER,
				feature_id: "messages",
				required_balance: 3,
				lock: { enabled: true, lock_id: "lock_1" },
			}),
		);
	const finalizeOn = (replica: Replica) =>
		replica.app.request(
			"/v1/balances.finalize",
			lockCall({ customer_id: CUSTOMER, lock_id: "lock_1", action: "release" }),
		);

	test("still unsent at the move is handed with its lock row, settled on the new owner, and handed in once before its finalize", async () => {
		const journals = recordJournals();
		const { a, b } = await agreeingPair({ bForwarder: journals.forwarder });
		connect({ replicas: [a, b] });
		expect((await lockOn(a)).status).toBe(200);
		expect(await remainingAt(a)).toBe(7);
		const aWriter = journalOwing(a)?.writerId;

		await a.leave();

		expect(await remainingAt(b)).toBe(7);
		const reply = await finalizeOn(b);
		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		expect(await reply.json()).toEqual({ success: true });
		expect(await remainingAt(b)).toBe(10);
		// B hands the lock's track in under A's writer, then its own finalize after it, so Autumn applies them in order.
		await until(() => journals.handedIn.length === 2);
		expect(
			journals.handedIn.map(({ type, writer }) => ({
				type,
				writer: writer === aWriter ? "a" : "b",
			})),
		).toEqual([
			{ type: "track", writer: "a" },
			{ type: "finalize", writer: "b" },
		]);
	});

	test("already sent to Autumn by the leaver is still settled on the new owner, which hands in the finalize alone", async () => {
		const journals = recordJournals();
		const { a, b } = await agreeingPair({
			aForwarder: journals.forwarder,
			bForwarder: journals.forwarder,
		});
		connect({ replicas: [a, b] });
		expect((await lockOn(a)).status).toBe(200);
		await until(() => journals.appended.length === 1);
		const aWriter = journalOwing(a)?.writerId;

		await a.leave();

		const reply = await finalizeOn(b);
		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		expect(await remainingAt(b)).toBe(10);
		await until(() => journals.handedIn.length === 2);
		await Bun.sleep(60);
		expect(
			journals.handedIn.map(({ type, writer }) => ({
				type,
				writer: writer === aWriter ? "a" : "b",
			})),
		).toEqual([
			{ type: "track", writer: "a" },
			{ type: "finalize", writer: "b" },
		]);
	});

	test("whose track Autumn already applied (nothing owed) is still settled on the new owner, from the row the leaver hands with its entries", async () => {
		const calls: string[] = [];
		const journals = recordJournals();
		const { a, b } = await agreeingPair({
			aForwarder: journals.forwarder,
			bForwarder: journals.forwarder,
		});
		connect({
			replicas: [a, b],
			autumn: async (request) => {
				calls.push(new URL(request.url).pathname);
				return Response.json({ success: true });
			},
		});
		expect((await lockOn(a)).status).toBe(200);
		await until(() => journals.handedIn.length === 1);
		const aWriter = journalOwing(a)?.writerId ?? "";
		// The row's id is the track's lock id, as the worker inserts it.
		const rowId = journals.commands[0]?.lock?.id ?? "";
		expect(rowId).not.toBe("");
		// Autumn's worker applied the lock's track: its push names A's seq and shows the lock open, so nothing stays owed.
		for (const replica of [a, b])
			await replica.slots.processorFor({ customerId: CUSTOMER }).setSubject({
				customerId: CUSTOMER,
				body: appliedLockBodyFor({
					customerId: CUSTOMER,
					readAt: 1800,
					balance: 7,
					writerSeqs: { [aWriter]: 1 },
					openLock: { id: rowId, lock_id: "lock_1" },
				}),
			});
		expect(journalOwing(a)).toBeUndefined();

		await a.leave();

		const reply = await finalizeOn(b);
		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		expect(await reply.json()).toEqual({ success: true });
		expect(calls).toEqual([]);
		expect(await remainingAt(b)).toBe(10);
		await until(() => journals.handedIn.length === 2);
		expect(journals.handedIn[1]).toEqual({
			type: "finalize",
			writer: journalOwing(b)?.writerId ?? "",
		});
	});

	test("finalized on the new owner while its handoff is still on the way waits at the barrier like a check, then settles here", async () => {
		const calls: string[] = [];
		const { a, b } = await agreeingPair();
		connect({ replicas: [a, b] });
		expect((await lockOn(a)).status).toBe(200);
		// The handoff takes 20 ms to land; the finalize reaches B the moment B hears A is leaving.
		connect({
			replicas: [a, b],
			beforeDispatch: async (request) => {
				if (new URL(request.url).pathname === PEER_HANDOFF_PATH)
					await Bun.sleep(20);
			},
			autumn: async (request) => {
				calls.push(new URL(request.url).pathname);
				return Response.json({ success: true });
			},
		});

		const leaving = a.leave();
		await until(() => b.membership.isLeaving(A));
		const reply = await finalizeOn(b);
		await leaving;

		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		expect(calls).toEqual([]);
		expect(await remainingAt(b)).toBe(10);
		expect(b.stats().handoffLate).toBe(0);
	});

	test("taken on the stand-in after the flip is taken on the new owner instead, so its finalize settles there", async () => {
		const calls: string[] = [];
		const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
		const b = createReplica({
			address: B,
			peers: [A],
			ringPeers: [A],
			joined: [],
		});
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		// B owns everything while A is away; the handoff to A takes 20 ms to land.
		let handoffs = 0;
		connect({
			replicas: [a, b],
			beforeDispatch: async (request) => {
				if (new URL(request.url).pathname !== PEER_HANDOFF_PATH) return;
				handoffs++;
				await Bun.sleep(20);
			},
			autumn: async (request) => {
				calls.push(new URL(request.url).pathname);
				return Response.json({ success: true });
			},
		});
		await deductOn({ replica: b, times: 1 });

		const probing = b.probeOnce();
		await until(() => handoffs === 1);
		// B has flipped A: the lock request on B's public port goes to A, which waits for B's handoff and takes it.
		const lock = await lockOn(b);
		await probing;

		expect(lock.status).toBe(200);
		expect(lock.headers.get("x-atom-proxied")).toBe("owner");
		expect(await remainingAt(a)).toBe(6);
		const reply = await finalizeOn(b);
		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-proxied")).toBe("owner");
		expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		expect(calls).toEqual([]);
		expect(await remainingAt(a)).toBe(9);
	});

	test("never handed (the peer was down at the leave) is lock_not_held on the new owner, so the API settles it", async () => {
		const calls: string[] = [];
		const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({
			replicas: [a, b],
			autumn: async (request) => {
				calls.push(new URL(request.url).pathname);
				return Response.json({ success: true });
			},
		});
		expect((await lockOn(a)).status).toBe(200);
		// B unreachable for A's leave: nothing is handed.
		connect({ replicas: [a] });
		await a.leave();
		connect({
			replicas: [a, b],
			autumn: async (request) => {
				calls.push(new URL(request.url).pathname);
				return Response.json({ success: true });
			},
		});
		b.membership.markLeaving(A);

		const reply = await finalizeOn(b);
		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-forwarded")).toBe("lock_not_held");
		expect(calls).toEqual(["/v1/balances.finalize"]);
	});
});

describe("an idempotency key taken on the leaving owner just before it hands over", () => {
	const keyedTrack = (key: string) => ({
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: "Bearer am_sk_test_1",
			"x-atom-token": ATOM_TOKEN,
			"x-api-version": LATEST_VERSION,
		},
		body: JSON.stringify({
			customer_id: CUSTOMER,
			feature_id: "messages",
			value: 1,
			idempotency_key: key,
		}),
	});

	test("rides the handoff with its owed entry, so its retry is a duplicate on the new owner even when the relay has not landed yet", async () => {
		const { a, b } = await agreeingPair();
		// The relay to B does not get through; the handoff does.
		connect({
			replicas: [a, b],
			beforeDispatch: async (request) => {
				if (new URL(request.url).pathname === KEYS_RELAY.path)
					throw Object.assign(new TypeError("connect ECONNREFUSED"), {
						code: "ECONNREFUSED",
					});
			},
		});
		expect((await a.app.request("/v1/track", keyedTrack("evt_1"))).status).toBe(
			202,
		);

		await a.leave();

		const retried = await b.app.request("/v1/track", keyedTrack("evt_1"));
		expect(retried.status).toBe(409);
		expect(retried.headers.get("x-atom-forwarded")).toBeNull();
		const fresh = await b.app.request("/v1/track", keyedTrack("evt_2"));
		expect(fresh.status).toBe(202);
	});
});

export { PEER_PORT };
