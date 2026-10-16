import { afterEach, describe, expect, test } from "bun:test";
import { ApiVersion, LATEST_VERSION } from "@autumn/shared";
import {
	ATOM_TOKEN,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	type Replica,
	settle,
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

const callOf = ({
	body,
	apiVersion = LATEST_VERSION,
	idempotencyKey,
}: {
	body: Record<string, unknown>;
	apiVersion?: string;
	idempotencyKey?: string;
}) => ({
	method: "POST",
	headers: {
		"content-type": "application/json",
		authorization: "Bearer am_sk_test_1",
		"x-atom-token": ATOM_TOKEN,
		"x-api-version": apiVersion,
		...(idempotencyKey && { "idempotency-key": idempotencyKey }),
	},
	body: JSON.stringify(body),
});

const lockOn = (replica: Replica) =>
	replica.app.request(
		"/v1/balances.check",
		callOf({
			body: {
				customer_id: CUSTOMER,
				feature_id: "messages",
				required_balance: 30,
				lock: { enabled: true, lock_id: "lock_1" },
			},
		}),
	);

const finalizeOn = (
	replica: Replica,
	body: Record<string, unknown> = {},
	apiVersion?: string,
	idempotencyKey?: string,
) =>
	replica.app.request(
		"/v1/balances.finalize",
		callOf({
			body: {
				customer_id: CUSTOMER,
				lock_id: "lock_1",
				action: "release",
				...body,
			},
			apiVersion,
			idempotencyKey,
		}),
	);

/** As the SDK sends it under useEdge: it resends the same key to the API when the Atom cannot settle it. */
const keyedFinalizeOn = (
	replica: Replica,
	body: Record<string, unknown> = {},
) => finalizeOn(replica, body, undefined, "key_1");

const remainingOn = async (replica: Replica) => {
	const reply = await replica.app.request(
		"/v1/balances.check",
		callOf({ body: { customer_id: CUSTOMER, feature_id: "messages" } }),
	);
	return (await reply.json()).balance.remaining;
};

const replicaAt100 = async ({
	autumn,
}: {
	autumn?: (request: Request) => Promise<Response>;
} = {}) => {
	const replica = createReplica({ address: A, peers: [] });
	await storeOnly({
		replica,
		customerId: CUSTOMER,
		readAt: 1700,
		balance: 100,
	});
	connect({ replicas: [replica], autumn });
	return replica;
};

const apiCalls = () => {
	const calls: string[] = [];
	return {
		calls,
		autumn: async (request: Request) => {
			calls.push(new URL(request.url).pathname);
			return Response.json({ code: "lock_not_found" }, { status: 404 });
		},
	};
};

describe("a finalize of a lock the Atom took", () => {
	test("is answered here as the API answers it: 200 and { success: true }, and the held units come back", async () => {
		const replica = await replicaAt100();
		await lockOn(replica);
		expect(await remainingOn(replica)).toBe(70);

		const reply = await finalizeOn(replica);

		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		expect(await reply.json()).toEqual({ success: true });
		expect(await remainingOn(replica)).toBe(100);
	});

	test("L1: on a replica that does not own the customer is answered by the owner", async () => {
		const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		for (const replica of [a, b])
			await storeOnly({
				replica,
				customerId: CUSTOMER,
				readAt: 1700,
				balance: 100,
			});
		connect({ replicas: [a, b] });
		await lockOn(b);

		const reply = await finalizeOn(b);

		expect(reply.status).toBe(200);
		expect(reply.headers.get("x-atom-proxied")).toBe("owner");
		expect(await remainingOn(b)).toBe(100);
	});
});

describe("a finalize the Atom leaves to the API", () => {
	test("before 2.6, or at 2.6 without the customer_id the API requires, is forwarded with the reason its shape names", async () => {
		const calls: string[] = [];
		const replica = await replicaAt100({
			autumn: async (request) => {
				calls.push(new URL(request.url).pathname);
				return Response.json({ success: true });
			},
		});
		await lockOn(replica);

		const withoutCustomer = await finalizeOn(replica, {
			customer_id: undefined,
		});
		const beforeVersion = await finalizeOn(replica, {}, ApiVersion.V2_5);
		await settle();

		expect(withoutCustomer.headers.get("x-atom-forwarded")).toBe(
			"unreadable_request",
		);
		expect(beforeVersion.headers.get("x-atom-forwarded")).toBe("lock_version");
		expect(calls).toEqual(["/v1/balances.finalize", "/v1/balances.finalize"]);
		expect(await remainingOn(replica)).toBe(70);
	});
});

describe("a keyed finalize the Atom cannot settle", () => {
	test("is a 503 without x-atom-forwarded, so the SDK sends it to the API under its key; the Atom never forwards it", async () => {
		const api = apiCalls();
		const replica = await replicaAt100({ autumn: api.autumn });

		const notHeld = await keyedFinalizeOn(replica, { lock_id: "lock_never" });
		const beforeVersion = await finalizeOn(
			replica,
			{ lock_id: "lock_never" },
			ApiVersion.V2_5,
			"key_2",
		);
		await settle();

		for (const reply of [notHeld, beforeVersion]) {
			expect(reply.status).toBe(503);
			expect(await reply.json()).toMatchObject({ code: "atom_cannot_settle" });
			expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		}
		expect(api.calls).toEqual([]);
	});

	test("unkeyed, is still forwarded to the API with its reason", async () => {
		const api = apiCalls();
		const replica = await replicaAt100({ autumn: api.autumn });

		const notHeld = await finalizeOn(replica, { lock_id: "lock_never" });

		expect(notHeld.headers.get("x-atom-forwarded")).toBe("lock_not_held");
		expect(api.calls).toEqual(["/v1/balances.finalize"]);
	});
});

describe("a finalize the Atom cannot run for a transport reason", () => {
	test("on a stopping replica is a 503 without x-atom-forwarded, as a check there is, so the SDK asks the API", async () => {
		const api = apiCalls();
		const replica = createReplica({
			address: A,
			peers: [],
			stopping: () => true,
		});
		connect({ replicas: [replica], autumn: api.autumn });

		const finalized = await keyedFinalizeOn(replica);
		const checked = await replica.app.request(
			"/v1/balances.check",
			callOf({ body: { customer_id: CUSTOMER, feature_id: "messages" } }),
		);

		expect(finalized.status).toBe(503);
		expect(await finalized.json()).toMatchObject({ code: "atom_stopping" });
		expect(finalized.headers.get("x-atom-forwarded")).toBeNull();
		expect(checked.status).toBe(503);
		expect(checked.headers.get("x-atom-forwarded")).toBeNull();
		expect(api.calls).toEqual([]);
	});

	test("keyed and handed on to an owner that cannot be reached, or that is stopping, is a 503 the SDK takes to the API", async () => {
		const api = apiCalls();
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			stopping: () => true,
		});
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		await storeOnly({ replica: b, customerId: CUSTOMER, readAt: 1700 });

		connect({ replicas: [b], autumn: api.autumn });
		const unreachable = await keyedFinalizeOn(b);
		disconnect();
		connect({ replicas: [a, b], autumn: api.autumn });
		const shed = await keyedFinalizeOn(b);

		for (const reply of [unreachable, shed]) {
			expect(reply.status).toBe(503);
			expect(await reply.json()).toMatchObject({ code: "atom_cannot_settle" });
			expect(reply.headers.get("x-atom-forwarded")).toBeNull();
		}
		expect(api.calls).toEqual([]);
	});
});
