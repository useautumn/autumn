import { afterEach, describe, expect, type Mock, spyOn, test } from "bun:test";
import { LATEST_VERSION } from "@autumn/shared";
import {
	ATOM_TOKEN,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	PEER_PORT,
	recordJournals,
	settle,
	storeOnly,
} from "../replication/replicaFixtures.js";
import { until } from "../utils/fakeAutumnTracks.js";

afterEach(() => {
	disconnect();
	cleanUpReplicas();
});

const A = "10.0.0.1";
const B = "10.0.0.2";
const GONE = "10.0.0.9";
/** Owned by A among {A, B}. */
const CUSTOMER = "cus_1";
/** Owned by A among {A, B}, but by GONE among {A, GONE}. */
const SKEWED_CUSTOMER = "cus_10";

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

/** Two replicas that agree on the ring: A owns CUSTOMER, and both hold it at a balance of 10. */
const agreeingPair = async () => {
	const journals = recordJournals();
	const a = createReplica({
		address: A,
		peers: [B],
		ringPeers: [B],
		journalForwarder: journals.forwarder,
	});
	const b = createReplica({
		address: B,
		peers: [A],
		ringPeers: [A],
		journalForwarder: journals.forwarder,
	});
	for (const replica of [a, b])
		await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
	return { a, b, appended: journals.appended };
};

const countingAutumn = (reply: () => Response = () => Response.json({})) => {
	const calls: string[] = [];
	return {
		calls,
		autumn: async (request: Request) => {
			calls.push(new URL(request.url).pathname);
			return reply();
		},
	};
};

describe("a check on a replica that does not own the customer", () => {
	test("is answered by the owner, from the owner's view: a deduction made there is seen through the other replica", async () => {
		const { a, b } = await agreeingPair();
		connect({ replicas: [a, b] });

		const deducted = await a.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);
		const viaB = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER }),
		);

		expect(deducted.headers.get("x-atom-forwarded")).toBeNull();
		expect(viaB.headers.get("x-atom-proxied")).toBe("owner");
		expect(viaB.headers.get("x-atom-forwarded")).toBeNull();
		expect((await viaB.json()).balance.remaining).toBe(9);
		expect(b.stats().checksProxied).toBe(1);
		expect(a.stats().checksProxied).toBe(0);
	});

	test("carries its request id to the owner, so the deduction is journaled under the same id wherever it is answered", async () => {
		const { a, b, appended } = await agreeingPair();
		connect({ replicas: [a, b] });

		await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);
		await until(() => appended.length === 1);

		const [hop] = (globalThis.fetch as unknown as Mock<typeof fetch>).mock
			.calls;
		expect(String(hop?.[0])).toBe(`http://${A}:${PEER_PORT}/v1/balances.check`);
		const requestId = new Headers(hop?.[1]?.headers).get("x-atom-request-id");
		expect(requestId).toStartWith("atom_req_");
		expect(appended).toEqual([
			{
				writer: expect.any(String),
				owner: String(requestId),
				key: undefined,
				value: 1,
			},
		]);
	});

	test("goes to the Autumn API when the owner cannot be reached, and the non-owner deducts nothing", async () => {
		const { b, appended } = await agreeingPair();
		const autumn = countingAutumn();
		connect({ replicas: [b], autumn: autumn.autumn });

		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);
		await settle();

		expect(reply.headers.get("x-atom-forwarded")).toBe("owner_unavailable");
		expect(autumn.calls).toEqual(["/v1/balances.check"]);
		expect(appended).toHaveLength(0);
		expect(b.stats().ownerUnavailable).toBe(1);
	});

	test("goes to the Autumn API when the owner sheds it with a 503", async () => {
		const { a, b } = await agreeingPair();
		const autumn = countingAutumn();
		connect({
			replicas: [a, b],
			autumn: autumn.autumn,
			replyFrom: async (replica, reply) =>
				replica === a
					? Response.json({ code: "atom_overloaded" }, { status: 503 })
					: reply,
		});

		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER }),
		);

		expect(reply.headers.get("x-atom-forwarded")).toBe("owner_unavailable");
		expect(autumn.calls).toEqual(["/v1/balances.check"]);
		expect(b.stats().ownerUnavailable).toBe(1);
	});

	test("that may have reached the owner (its reply lost after the send) is never answered again: a 504, and the API is not asked", async () => {
		const { a, b } = await agreeingPair();
		const autumn = countingAutumn();
		connect({
			replicas: [a, b],
			autumn: autumn.autumn,
			replyFrom: async (replica, reply) => {
				if (replica !== a) return reply;
				throw Object.assign(new TypeError("read ECONNRESET"), {
					code: "ECONNRESET",
				});
			},
		});

		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);

		expect(reply.status).toBe(504);
		expect(await reply.json()).toMatchObject({ code: "atom_peer_timeout" });
		expect(autumn.calls).toEqual([]);
	});

	test("gets the owner's own refusal as it was given: status, body, and the API's answer marked as forwarded", async () => {
		const { a, b } = await agreeingPair();
		const autumn = countingAutumn(() =>
			Response.json({ code: "feature_not_found" }, { status: 404 }),
		);
		connect({ replicas: [a, b], autumn: autumn.autumn });

		const reply = await b.app.request("/v1/balances.check", {
			...checkFor({ customerId: CUSTOMER }),
			body: JSON.stringify({ customer_id: CUSTOMER, feature_id: "missing" }),
		});

		expect(reply.status).toBe(404);
		expect(await reply.json()).toEqual({ code: "feature_not_found" });
		expect(reply.headers.get("x-atom-proxied")).toBe("owner");
		// Without it the SDK takes the API's reply for the Atom's own, and asks the API again.
		expect(reply.headers.get("x-atom-forwarded")).toBe("feature_not_stored");
		expect(autumn.calls).toEqual(["/v1/balances.check"]);
	});
});

describe("the request line of a check hopped to its owner", () => {
	type Line = { fields: { statusCode: number; sample_rate?: number } };
	/** Every sampled line falls inside the 1-in-100 sample, or none does. */
	const sampleEvery = ({ sampled }: { sampled: boolean }) =>
		spyOn(Math, "random").mockReturnValue(sampled ? 0 : 0.99);
	const loggingReplica = ({
		address,
		peer,
	}: {
		address: string;
		peer: string;
	}) => {
		const logged: Line[] = [];
		const record = (fields: unknown) => void logged.push({ fields } as Line);
		const replica = createReplica({
			address,
			peers: [peer],
			ringPeers: [peer],
			logger: { info: record, warn: record, error: record },
		});
		return { replica, logged };
	};
	afterEach(() => spyOn(Math, "random").mockRestore());

	test("is sampled like an allowed check, since the owner logs the answer itself; outside the sample the hop leaves no line", async () => {
		sampleEvery({ sampled: false });
		const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
		const { replica: b, logged } = loggingReplica({ address: B, peer: A });
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b] });

		const viaB = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER }),
		);

		expect(viaB.headers.get("x-atom-proxied")).toBe("owner");
		expect(logged).toEqual([]);
	});

	test("inside the sample the hop's line says its rate", async () => {
		sampleEvery({ sampled: true });
		const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
		const { replica: b, logged } = loggingReplica({ address: B, peer: A });
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b] });

		await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER }),
		);

		expect(
			logged.map(({ fields }) => [fields.statusCode, fields.sample_rate]),
		).toEqual([[200, 0.01]]);
	});
});

describe("a check handed to an owner that is stopping", () => {
	test("is refused there, so the replica that handed it on leaves it to the API: owner_unavailable, never a 504", async () => {
		const autumn = countingAutumn();
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			stopping: () => true,
		});
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b], autumn: autumn.autumn });

		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);

		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-forwarded")).toBe("owner_unavailable");
		expect(autumn.calls).toEqual(["/v1/balances.check"]);
		expect(b.stats().ownerUnavailable).toBe(1);
	});
});

describe("a check handed to an owner that has not caught up yet", () => {
	test("is refused there as not ready, so the replica that handed it on leaves it to the API: nothing stale is answered", async () => {
		const autumn = countingAutumn();
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			ready: false,
		});
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		// A's files are behind: the copy it holds predates the one B holds.
		await storeOnly({
			replica: a,
			customerId: CUSTOMER,
			readAt: 1600,
			balance: 3,
		});
		await storeOnly({ replica: b, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b], autumn: autumn.autumn });

		const reply = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: CUSTOMER, sendEvent: true }),
		);

		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-forwarded")).toBe("owner_unavailable");
		// The API's answer, not A's stale balance of 3.
		expect(await reply.json()).toEqual({});
		expect(autumn.calls).toEqual(["/v1/balances.check"]);
		expect(b.stats().ownerUnavailable).toBe(1);
	});
});

describe("a check that reached the owner from another replica", () => {
	test("is hopped on once when that replica's ring names someone else, and goes to the API when that one cannot be reached: never a loop, never a second owner", async () => {
		const autumn = countingAutumn();
		const a = createReplica({ address: A, peers: [B], ringPeers: [GONE] });
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		await storeOnly({
			replica: a,
			customerId: SKEWED_CUSTOMER,
			readAt: 1700,
			balance: 7,
		});
		connect({ replicas: [a, b], autumn: autumn.autumn });

		const viaB = await b.app.request(
			"/v1/balances.check",
			checkFor({ customerId: SKEWED_CUSTOMER }),
		);
		const onA = await a.app.request(
			"/v1/balances.check",
			checkFor({ customerId: SKEWED_CUSTOMER }),
		);

		expect(viaB.headers.get("x-atom-proxied")).toBe("owner");
		expect(viaB.headers.get("x-atom-forwarded")).toBe("owner_unavailable");
		expect(onA.headers.get("x-atom-forwarded")).toBe("owner_unavailable");
		expect(autumn.calls).toEqual(["/v1/balances.check", "/v1/balances.check"]);
	});
});

describe("replicas that disagree on who owns a customer", () => {
	test("each deduct under their own journal's writer, and Autumn counts both: safety never rests on agreement", async () => {
		const journals = recordJournals();
		const a = createReplica({
			address: A,
			peers: [B],
			journalForwarder: journals.forwarder,
		});
		const b = createReplica({
			address: B,
			peers: [A],
			journalForwarder: journals.forwarder,
		});
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b] });

		const replies = await Promise.all(
			[a, b].map((replica) =>
				replica.app.request(
					"/v1/balances.check",
					checkFor({ customerId: CUSTOMER, sendEvent: true }),
				),
			),
		);
		await until(() => journals.appended.length === 2);

		for (const reply of replies)
			expect(reply.headers.get("x-atom-proxied")).toBeNull();
		const [first, second] = journals.appended;
		expect(first?.writer).not.toBe(second?.writer);
		expect(first?.value).toBe(1);
		expect(second?.value).toBe(1);
	});
});

describe("a replica with no peers in its ring", () => {
	test("answers every customer's check itself", async () => {
		const alone = createReplica({ address: A, peers: [] });
		const customers = ["cus_1", "cus_2", "cus_3", "cus_4", "cus_5"];
		for (const customerId of customers)
			await storeOnly({ replica: alone, customerId, readAt: 1700 });
		connect({ replicas: [alone] });

		for (const customerId of customers) {
			const reply = await alone.app.request(
				"/v1/balances.check",
				checkFor({ customerId }),
			);
			expect(reply.headers.get("x-atom-proxied")).toBeNull();
			expect((await reply.json()).balance.remaining).toBe(10);
		}
		expect(alone.stats().checksProxied).toBe(0);
	});
});
