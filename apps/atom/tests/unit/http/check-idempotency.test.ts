import { afterEach, describe, expect, test } from "bun:test";
import { LATEST_VERSION } from "@autumn/shared";
import {
	ATOM_TOKEN,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
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

const deductingCheck = ({
	idempotencyKey,
}: {
	idempotencyKey?: string;
} = {}) => ({
	method: "POST",
	headers: {
		"content-type": "application/json",
		authorization: "Bearer am_sk_test_1",
		"x-atom-token": ATOM_TOKEN,
		"x-api-version": LATEST_VERSION,
		...(idempotencyKey !== undefined && { "Idempotency-Key": idempotencyKey }),
	},
	body: JSON.stringify({
		customer_id: CUSTOMER,
		feature_id: "messages",
		send_event: true,
	}),
});

const loneReplica = async () => {
	const journals = recordJournals();
	const replica = createReplica({
		address: A,
		peers: [],
		journalForwarder: journals.forwarder,
	});
	await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
	connect({ replicas: [replica] });
	return { replica, appended: journals.appended };
};

describe("a deducting check's idempotency key at Autumn", () => {
	test("is the client's Idempotency-Key, so the API deducting the same check after the SDK's fallback is a duplicate there", async () => {
		const { replica, appended } = await loneReplica();

		await replica.app.request(
			"/v1/balances.check",
			deductingCheck({ idempotencyKey: "key_from_client" }),
		);
		await until(() => appended.length === 1);

		expect(appended).toEqual([
			{
				writer: expect.any(String),
				owner: expect.stringMatching(/^atom_req_/),
				key: "key_from_client",
				value: 1,
			},
		]);
	});

	test("is none when the client sent none, or sent an empty one: the worker claims nothing and the seq refuses a resend", async () => {
		const { replica, appended } = await loneReplica();

		for (const check of [
			deductingCheck(),
			deductingCheck({ idempotencyKey: "" }),
		])
			await replica.app.request("/v1/balances.check", check);
		await until(() => appended.length === 2);

		for (const { owner, key } of appended) {
			expect(owner).toStartWith("atom_req_");
			expect(key).toBeUndefined();
		}
	});

	test("is deduplicated by the Atom per customer: the same key again is 409 in the API's words and journals once", async () => {
		const { replica, appended } = await loneReplica();

		const replies = [];
		for (let i = 0; i < 2; i++)
			replies.push(
				await replica.app.request(
					"/v1/balances.check",
					deductingCheck({ idempotencyKey: "key_from_client" }),
				),
			);
		await until(() => appended.length === 1);

		expect(replies.map(({ status }) => status)).toEqual([200, 409]);
		expect(await replies[1]?.json()).toEqual({
			code: "duplicate_idempotency_key",
			message:
				"Another request with idempotency key key_from_client has already been received",
		});
		expect(appended.map(({ key }) => key)).toEqual(["key_from_client"]);
	});

	test("survives the hop: a check the owner answers for another replica keeps the client's key", async () => {
		const journals = recordJournals();
		const a = createReplica({
			address: A,
			peers: [B],
			ringPeers: [B],
			journalForwarder: journals.forwarder,
		});
		const b = createReplica({ address: B, peers: [A], ringPeers: [A] });
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b] });

		const reply = await b.app.request(
			"/v1/balances.check",
			deductingCheck({ idempotencyKey: "key_from_client" }),
		);
		await until(() => journals.appended.length === 1);

		expect(reply.headers.get("x-atom-proxied")).toBe("owner");
		expect(journals.appended[0]?.key).toBe("key_from_client");
	});
});
