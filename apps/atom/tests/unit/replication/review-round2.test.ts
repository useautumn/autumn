import { afterEach, describe, expect, test } from "bun:test";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { LATEST_VERSION } from "@autumn/shared";
import {
	storedEntitySubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";
import {
	ATOM_TOKEN,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	type Replica,
	settle,
} from "./replicaFixtures.js";

afterEach(() => {
	disconnect();
	cleanUpReplicas();
});

const customerMessagesOn = async (replica: Replica) => {
	const reply = await replica.app.request("/v1/balances.check", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: "Bearer am_sk_test_1",
			"x-atom-token": ATOM_TOKEN,
			"x-api-version": LATEST_VERSION,
		},
		body: JSON.stringify({ customer_id: "cus_1", feature_id: "messages" }),
	});
	return {
		forwarded: reply.headers.get("x-atom-forwarded"),
		body: await reply.json().catch(() => null),
	};
};

describe("boot resend (review round 2 of #4605)", () => {
	test("resending an entity's stored row must not wipe the customer's own rows on a peer", async () => {
		let now = 1_000_000;
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
		connect({
			replicas: [a, b],
			autumn: async () => Response.json({ forwarded: true }),
		});
		const push = subjectPushOf({
			subject: storedEntitySubjectWith({
				customerBalance: 10,
				entityBalance: 5,
				readAt: 1_700,
			}),
		});
		await a.app.request("/v1/subjects.set", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-atom-token": ATOM_TOKEN,
				[ATOM_CUSTOMER_ID_HEADER]: push.customerId,
			},
			body: push.body,
		});
		await settle();
		const before = await customerMessagesOn(b);

		now += 60_000;
		await a.sync().catchUp();
		await b.sync().pass();
		await settle();
		const after = await customerMessagesOn(b);

		expect(before.forwarded).toBeNull();
		expect(before.body.balance.remaining).toBe(10);
		expect(after).toEqual(before);
	});
});
