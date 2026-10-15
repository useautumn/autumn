/**
 * Idempotency keys are replicated state (atom-handoff-strategy.md §3.5 K1): a keyed track's key row is relayed to every
 * other replica, batched per thread per 20 ms, so a replay is refused wherever it lands, with nothing handed over.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import { LATEST_VERSION } from "@autumn/shared";
import {
	cleanUpMultiTenantReplicas,
	createMultiTenantReplica,
	putTenant,
	TENANT_TOKENS,
} from "./multiTenantReplicaFixtures.js";
import {
	ATOM_TOKEN,
	bodyFor,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	keyRowsOn,
	PEER_PORT,
	relayLanded,
	settle,
	storeOnly,
} from "./replicaFixtures.js";

afterEach(() => {
	disconnect();
	cleanUpReplicas();
	cleanUpMultiTenantReplicas();
});

const A = "10.0.0.1";
const B = "10.0.0.2";
const CUSTOMER = "cus_1";

const keyedTrack = ({
	key,
	token = ATOM_TOKEN,
}: {
	key?: string;
	token?: string;
}) => ({
	method: "POST",
	headers: {
		"content-type": "application/json",
		authorization: "Bearer am_sk_test_1",
		"x-atom-token": token,
		"x-api-version": LATEST_VERSION,
	},
	body: JSON.stringify({
		customer_id: CUSTOMER,
		feature_id: "messages",
		value: 1,
		...(key !== undefined && { idempotency_key: key }),
	}),
});

const keyedCheck = ({ key }: { key: string }) => ({
	method: "POST",
	headers: {
		"content-type": "application/json",
		authorization: "Bearer am_sk_test_1",
		"x-atom-token": ATOM_TOKEN,
		"x-api-version": LATEST_VERSION,
		"Idempotency-Key": key,
	},
	body: JSON.stringify({
		customer_id: CUSTOMER,
		feature_id: "messages",
		send_event: true,
	}),
});

/** Two replicas relaying to each other, neither in the other's ring: each answers the customer itself, so nothing is handed over. */
const relayingPair = async () => {
	const a = createReplica({ address: A, peers: [B] });
	const b = createReplica({ address: B, peers: [A] });
	for (const replica of [a, b])
		await storeOnly({
			replica,
			customerId: CUSTOMER,
			readAt: 1700,
			balance: 100,
		});
	return { a, b };
};

/** Every peer request A makes to B, by path. */
const peerRequestsToB = () => {
	const paths: string[] = [];
	return {
		paths,
		beforeDispatch: async (request: Request) => {
			const url = new URL(request.url);
			if (url.hostname === B && Number(url.port) === PEER_PORT)
				paths.push(url.pathname);
		},
	};
};

const duplicateOf = (key: string) => ({
	code: "duplicate_idempotency_key",
	message: `Another request with idempotency key ${key} has already been received`,
});

describe("an idempotency key taken on one replica", () => {
	test("is refused as a duplicate (409) on the other within the relay linger, with nothing handed over", async () => {
		const { a, b } = await relayingPair();
		const requests = peerRequestsToB();
		connect({ replicas: [a, b], beforeDispatch: requests.beforeDispatch });

		expect(
			(await a.app.request("/v1/track", keyedTrack({ key: "evt_1" }))).status,
		).toBe(202);
		await relayLanded(() => keyRowsOn(b).length === 1);
		const replayed = await b.app.request(
			"/v1/track",
			keyedTrack({ key: "evt_1" }),
		);

		expect(replayed.status).toBe(409);
		expect(await replayed.json()).toEqual(duplicateOf("evt_1"));
		expect(requests.paths.some((path) => path.includes("handoff"))).toBe(false);
	});

	test("by a deducting check's Idempotency-Key is refused on the other replica too", async () => {
		const { a, b } = await relayingPair();
		connect({ replicas: [a, b] });

		expect(
			(await a.app.request("/v1/balances.check", keyedCheck({ key: "chk_1" })))
				.status,
		).toBe(200);
		await relayLanded(() => keyRowsOn(b).length === 1);
		const replayed = await b.app.request(
			"/v1/balances.check",
			keyedCheck({ key: "chk_1" }),
		);

		expect(replayed.status).toBe(409);
		expect(await replayed.json()).toEqual(duplicateOf("chk_1"));
	});

	test("relayed again after its reply was lost leaves one row on the other replica", async () => {
		const { a, b } = await relayingPair();
		let lost = 0;
		connect({
			replicas: [a, b],
			replyFrom: async (replica, reply, request) => {
				const url = new URL(request.url);
				if (replica.address === B && Number(url.port) === PEER_PORT && !lost++)
					throw new TypeError("socket hang up");
				return reply;
			},
		});

		await a.app.request("/v1/track", keyedTrack({ key: "evt_1" }));
		await relayLanded(() => lost === 1 && keyRowsOn(b).length === 1);
		await settle();

		expect(keyRowsOn(b).map(({ customerId }) => customerId)).toEqual([
			CUSTOMER,
		]);
	});

	test("a keyless track sends the other replica nothing", async () => {
		const { a, b } = await relayingPair();
		const requests = peerRequestsToB();
		connect({ replicas: [a, b], beforeDispatch: requests.beforeDispatch });

		expect((await a.app.request("/v1/track", keyedTrack({}))).status).toBe(202);
		await settle();

		expect(requests.paths).toEqual([]);
		expect(keyRowsOn(b)).toEqual([]);
	});
});

describe("the relay", () => {
	test("is batched: keyed tracks inside 20 ms cross as one request, and a burst after the linger as a second", async () => {
		const { a, b } = await relayingPair();
		const requests = peerRequestsToB();
		connect({ replicas: [a, b], beforeDispatch: requests.beforeDispatch });

		await Promise.all(
			Array.from({ length: 5 }, (_, i) =>
				a.app.request("/v1/track", keyedTrack({ key: `evt_${i}` })),
			),
		);
		await relayLanded(() => keyRowsOn(b).length === 5);
		await settle();
		expect(requests.paths).toHaveLength(1);

		await Promise.all(
			Array.from({ length: 3 }, (_, i) =>
				a.app.request("/v1/track", keyedTrack({ key: `evt_late_${i}` })),
			),
		);
		await relayLanded(() => keyRowsOn(b).length === 8);
		await settle();
		expect(requests.paths).toHaveLength(2);
	});

	test("lands in the tenant's own folder on a multi-tenant Atom, and no other tenant's", async () => {
		const a = createMultiTenantReplica({ address: A, peers: [B] });
		const b = createMultiTenantReplica({ address: B, peers: [A] });
		connect({ replicas: [a, b] });
		await putTenant({ replica: a, id: "org_a" });
		await putTenant({ replica: a, id: "org_b" });
		await settle();
		for (const tenant of ["org_a", "org_b"])
			await a.app.request("/v1/subjects.set", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-atom-token": TENANT_TOKENS[tenant] ?? "",
					[ATOM_CUSTOMER_ID_HEADER]: CUSTOMER,
				},
				body: bodyFor({ customerId: CUSTOMER, readAt: 1_700, balance: 100 }),
			});
		await settle();
		const trackAs = (replica: typeof a, tenant: string) =>
			replica.app.request(
				"/v1/track",
				keyedTrack({ key: "evt_1", token: TENANT_TOKENS[tenant] ?? "" }),
			);

		expect((await trackAs(a, "org_a")).status).toBe(202);
		await relayLanded(() =>
			(b.auth.slotsFor({ atomId: "org_a" })?.ownedJournals() ?? []).some(
				(journal) =>
					journal.holdsKey({ customerId: CUSTOMER, key: "track:evt_1" }),
			),
		);

		expect((await trackAs(b, "org_a")).status).toBe(409);
		expect((await trackAs(b, "org_b")).status).toBe(202);
	});
});
