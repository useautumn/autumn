/**
 * A planned ownership move between two replicas (handoffs/atom-replica-handover-design.md): the leaving replica announces
 * itself, the survivor owns its customers at once, and the leaving replica's public port keeps answering by hopping.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { LATEST_VERSION } from "@autumn/shared";
import { peerRequestHeaders } from "../../../src/replication/transport/peerSignature.js";
import {
	ATOM_TOKEN,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	PEER_PORT,
	PEER_SECRET,
	storeOnly,
} from "../replication/replicaFixtures.js";

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

/** Two replicas that agree on the ring and both hold CUSTOMER at 10; A owns it. */
const agreeingPair = async () => {
	const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
	const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
	for (const replica of [a, b])
		await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
	return { a, b };
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

export { PEER_PORT };
