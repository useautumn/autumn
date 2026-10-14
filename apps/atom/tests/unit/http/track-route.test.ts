import { afterEach, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	LATEST_VERSION,
	TrackResponseV3Schema,
} from "@autumn/shared";
import {
	ATOM_TOKEN,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	type Replica,
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
/** Owned by A among {A, B}. */
const CUSTOMER = "cus_1";

const trackOf = ({
	body,
	headers = {},
	apiVersion = LATEST_VERSION,
}: {
	body: Record<string, unknown>;
	headers?: Record<string, string>;
	apiVersion?: string;
}) => ({
	method: "POST",
	headers: {
		"content-type": "application/json",
		authorization: "Bearer am_sk_test_1",
		"x-atom-token": ATOM_TOKEN,
		"x-api-version": apiVersion,
		...headers,
	},
	body: JSON.stringify({
		customer_id: CUSTOMER,
		feature_id: "messages",
		...body,
	}),
});

const countingAutumn = () => {
	const calls: string[] = [];
	const forwardedBy: (string | null)[] = [];
	return {
		calls,
		forwardedBy,
		autumn: async (request: Request) => {
			calls.push(new URL(request.url).pathname);
			forwardedBy.push(request.headers.get("x-atom-forwarded-by"));
			return Response.json({ from: "api" }, { status: 202 });
		},
	};
};

/** One replica holding CUSTOMER at 100 messages, its journal recorded as Autumn would take it. */
const replicaAt100 = async () => {
	const journals = recordJournals();
	const replica = createReplica({
		address: A,
		peers: [],
		journalForwarder: journals.forwarder,
	});
	await storeOnly({
		replica,
		customerId: CUSTOMER,
		readAt: 1700,
		balance: 100,
	});
	const autumn = countingAutumn();
	connect({ replicas: [replica], autumn: autumn.autumn });
	return {
		replica,
		appended: journals.appended,
		commands: journals.commands,
		autumn,
	};
};

const remainingOn = async (replica: Replica) => {
	const reply = await replica.app.request("/v1/balances.check", {
		...trackOf({ body: {} }),
		body: JSON.stringify({ customer_id: CUSTOMER, feature_id: "messages" }),
	});
	return (await reply.json()).balance.remaining;
};

describe("a track the balance covers", () => {
	test("is deducted here and answered as the API answers a queued track: 202, the TrackResponse shape, keyed by the body's idempotency_key", async () => {
		const { replica, appended, commands, autumn } = await replicaAt100();

		const reply = await replica.app.request(
			"/v1/track",
			trackOf({ body: { value: 10, idempotency_key: "evt_1" } }),
		);
		await until(() => appended.length === 1);

		expect(reply.status).toBe(202);
		const body = await reply.json();
		expect(body).toEqual({ customer_id: CUSTOMER, value: 10, balance: null });
		expect(TrackResponseV3Schema.safeParse(body).success).toBe(true);
		expect(appended).toEqual([
			{
				writer: expect.any(String),
				owner: expect.stringMatching(/^atom_req_/),
				key: "track:evt_1",
				value: 10,
			},
		]);
		expect(await remainingOn(replica)).toBe(90);
		expect(autumn.calls).toEqual([]);
		// /health counts a track with the checks: the track, then the check that read 90.
		expect(replica.stats()).toMatchObject({ checks: 2, requests: 2 });
		// The API's own track command: what fits, no overdue block, the event keyed by the body's key.
		expect(commands[0]).toMatchObject({
			overageBehavior: "cap",
			usageEvent: { name: "messages", idempotencyKey: "evt_1" },
		});
		expect(commands[0]?.enforceOverdueBlock).not.toBe(true);
	});

	test("without an idempotency_key in the body claims no key at Autumn, whatever Idempotency-Key header it carries", async () => {
		const { replica, appended } = await replicaAt100();

		await replica.app.request(
			"/v1/track",
			trackOf({
				body: { value: 10 },
				headers: { "Idempotency-Key": "header_key" },
			}),
		);
		await until(() => appended.length === 1);

		const [entry] = appended;
		expect(entry?.owner).toStartWith("atom_req_");
		expect(entry?.key).toBeUndefined();
	});

	test("on a replica that does not own the customer is answered by the owner", async () => {
		const journals = recordJournals();
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			journalForwarder: journals.forwarder,
		});
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		for (const replica of [a, b])
			await storeOnly({
				replica,
				customerId: CUSTOMER,
				readAt: 1700,
				balance: 100,
			});
		connect({ replicas: [a, b] });

		const reply = await b.app.request(
			"/v1/track",
			trackOf({ body: { value: 10, idempotency_key: "evt_1" } }),
		);
		await until(() => journals.appended.length === 1);

		expect(reply.status).toBe(202);
		expect(reply.headers.get("x-atom-proxied")).toBe("owner");
		expect(journals.appended[0]?.key).toBe("track:evt_1");
	});
});

describe("a keyed track sent again", () => {
	test("at a replica that does not own the customer is 409 from the owner, in the API's words, and journals once", async () => {
		const journals = recordJournals();
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			journalForwarder: journals.forwarder,
		});
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		for (const replica of [a, b])
			await storeOnly({
				replica,
				customerId: CUSTOMER,
				readAt: 1700,
				balance: 100,
			});
		connect({ replicas: [a, b] });
		const send = (replica: Replica) =>
			replica.app.request(
				"/v1/track",
				trackOf({ body: { value: 10, idempotency_key: "evt_1" } }),
			);

		expect((await send(a)).status).toBe(202);
		const retried = await send(b);

		expect(retried.status).toBe(409);
		expect(await retried.json()).toEqual({
			code: "duplicate_idempotency_key",
			message:
				"Another request with idempotency key evt_1 has already been received",
		});
		await settle();
		expect(journals.appended).toHaveLength(1);
	});
});

describe("a track the Atom leaves to the API", () => {
	test("that the balance does not cover is forwarded, and nothing is deducted here", async () => {
		const { replica, appended, autumn } = await replicaAt100();

		const reply = await replica.app.request(
			"/v1/track",
			trackOf({ body: { value: 200 } }),
		);
		await settle();

		expect(reply.status).toBe(202);
		expect(await reply.json()).toEqual({ from: "api" });
		expect(reply.headers.get("x-atom-forwarded")).toBe("track_denied");
		expect(autumn.calls).toEqual(["/v1/track"]);
		// The API reads it to claim the caller's key for the Atom's 90 min, not the org's TTL.
		expect(autumn.forwardedBy).toEqual(["track_denied"]);
		expect(appended).toHaveLength(0);
		expect(await remainingOn(replica)).toBe(100);
	});

	test("is forwarded with the reason its shape names", async () => {
		const { replica, autumn } = await replicaAt100();
		const cases: [ReturnType<typeof trackOf>, string][] = [
			[trackOf({ body: { entity_id: "ent_1" } }), "send_event"],
			[trackOf({ body: { customer_data: { name: "Ada" } } }), "customer_data"],
			[
				trackOf({ body: { feature_id: undefined, event_name: "msg" } }),
				"track_by_event",
			],
			[trackOf({ body: { async: false } }), "sync_track"],
			[trackOf({ body: {}, apiVersion: ApiVersion.V2_4 }), "sync_track"],
			[trackOf({ body: { overage_behavior: "overflow" } }), "track_option"],
			[trackOf({ body: { timestamp: 1_700_000_000_000 } }), "track_option"],
			[trackOf({ body: { value: -1 } }), "track_option"],
			[trackOf({ body: {}, apiVersion: ApiVersion.V2_0 }), "track_version"],
		];

		for (const [request, reason] of cases) {
			const reply = await replica.app.request("/v1/track", request);
			expect(reply.headers.get("x-atom-forwarded")).toBe(reason);
		}
		expect(autumn.calls).toHaveLength(cases.length);
	});
});
