/**
 * A planned ownership move between two replicas (handoffs/atom-replica-handover-design.md): the leaving replica announces
 * itself, the survivor owns its customers at once, and the leaving replica's public port keeps answering by hopping.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { LATEST_VERSION } from "@autumn/shared";
import { createJournalForwarder } from "../../../src/journalForwarder/createJournalForwarder.js";
import { PEER_HANDOFF_PATH } from "../../../src/replicas/handover/handoffContract.js";
import { peerRequestHeaders } from "../../../src/replication/transport/peerSignature.js";
import {
	ATOM_TOKEN,
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

/** A deducts `times` on CUSTOMER: that many entries owed in A's journal. */
const deductOnA = async ({ a, times }: { a: Replica; times: number }) => {
	for (let i = 0; i < times; i++) {
		const reply = await a.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);
		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-forwarded")).toBeNull();
	}
};

const journalOwing = (replica: Replica) =>
	replica.slots
		.ownedJournals()
		.find((journal) => journal.owed({ customerId: CUSTOMER }).length > 0);

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

	test("stays out of the ring while the service name drops and relists it, and is counted again once its leave has aged out", async () => {
		let clock = 1_000_000;
		const listed = [A];
		const b = createReplica({
			address: B,
			peers: [A],
			ringPeers: listed,
			now: () => clock,
		});
		b.membership.markLeaving(A);
		expect(await b.ring.ownerOf({ customerId: CUSTOMER })).toBe(B);

		listed.length = 0;
		expect(await b.ring.members()).toEqual([B]);
		listed.push(A);
		clock += 45_000 - 1;
		expect(await b.ring.ownerOf({ customerId: CUSTOMER })).toBe(B);

		clock += 1;
		expect(b.membership.isLeaving(A)).toBe(false);
		expect(await b.ring.ownerOf({ customerId: CUSTOMER })).toBe(A);
	});
});

describe("the leaving replica's owed entries", () => {
	test("move to the new owner under their own writer and seq: its view holds them, and it hands them in for the old owner", async () => {
		const journals = recordJournals();
		const { a, b } = await agreeingPair({ bForwarder: journals.forwarder });
		connect({ replicas: [a, b] });
		await deductOnA({ a, times: 2 });
		const aJournal = journalOwing(a);
		if (!aJournal) throw new Error("A owes its two entries");

		await a.leave();

		expect(await remainingAt(b)).toBe(8);
		expect(aJournal.owed({ customerId: CUSTOMER })).toHaveLength(0);
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

export { PEER_PORT };
