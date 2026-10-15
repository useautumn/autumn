/**
 * A keyed deduction a replica left to the API (n-stack rig matrix: kill9-traffic 59 and the N7 roll 1 key deducted
 * by the API on its first send and again by the Atom on the caller's retry, the Atom having no record of the key).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { LATEST_VERSION } from "@autumn/shared";
import {
	ATOM_TOKEN,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
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
const KEY = "key-forwarded-1";

const keyedDeduction = () => ({
	method: "POST",
	headers: {
		"content-type": "application/json",
		authorization: "Bearer am_sk_test_1",
		"x-atom-token": ATOM_TOKEN,
		"x-api-version": LATEST_VERSION,
		"idempotency-key": KEY,
	},
	body: JSON.stringify({
		customer_id: CUSTOMER,
		feature_id: "messages",
		required_balance: 1,
		send_event: true,
	}),
});

describe("a keyed deduction a replica left to the API", () => {
	test("rig red: its retry is never deducted again by an Atom replica (409, or left to the API too)", async () => {
		const a = createReplica({ address: A, peers: [B], ringPeers: [B] });
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		const apiTook: string[] = [];
		const api = async (request: Request) => {
			apiTook.push(request.headers.get("idempotency-key") ?? "");
			return Response.json({ allowed: true, customer_id: CUSTOMER });
		};

		// A, the owner, is down: B leaves the keyed deduction to the API.
		connect({ replicas: [b], autumn: api });
		const first = await b.app.request("/v1/balances.check", keyedDeduction());
		expect(first.headers.get("x-atom-forwarded")).toBe("owner_unavailable");
		expect(apiTook).toEqual([KEY]);

		// A is back; the caller retries the same key.
		disconnect();
		connect({ replicas: [a, b], autumn: api });
		const retry = await b.app.request("/v1/balances.check", keyedDeduction());

		const deductedByAtom =
			retry.status === 200 && retry.headers.get("x-atom-forwarded") === null;
		expect(deductedByAtom).toBe(false);
	});
});
