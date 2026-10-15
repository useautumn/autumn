/**
 * A replica that boots beside a peer copies the peer's idempotency keys of the last 30 minutes in its catch-up, before it
 * reports ready (atom-handoff-strategy.md §3.5 K1), so a replay of a key the peer took is refused here from the start.
 */

import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { LATEST_VERSION } from "@autumn/shared";
import { until } from "../utils/fakeAutumnTracks.js";
import {
	ATOM_TOKEN,
	cleanUpReplicas,
	connect,
	createReplica,
	disconnect,
	keyRowsOn,
	type Replica,
	recordJournals,
	relayLanded,
	settle,
	storeOnly,
} from "./replicaFixtures.js";

afterEach(() => {
	setSystemTime();
	disconnect();
	cleanUpReplicas();
});

const A = "10.0.0.1";
const B = "10.0.0.2";
const CUSTOMER = "cus_1";
const MINUTE_MS = 60_000;

const keyedTrack = ({ key }: { key: string }) => ({
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

/** A keyed track on `replica`, taken `minutesAgo` before `now` by the replica's clock, and handed in to Autumn. */
const trackTakenAgo = async ({
	replica,
	appended,
	key,
	now,
	minutesAgo,
}: {
	replica: Replica;
	appended: unknown[];
	key: string;
	now: number;
	minutesAgo: number;
}) => {
	const handedIn = appended.length;
	setSystemTime(now - minutesAgo * MINUTE_MS);
	expect(
		(await replica.app.request("/v1/track", keyedTrack({ key }))).status,
	).toBe(202);
	setSystemTime(now);
	// Handed in before the clock moves on, so its age never reads as a journal backlog.
	await until(() => appended.length === handedIn + 1);
};

describe("a replica booting beside a peer", () => {
	test("holds the peer's idempotency keys of the last 30 minutes before it reports ready: one 29 min old, none 31 min old", async () => {
		const now = Date.now();
		// A knows no peer, so B gets nothing by relay: only its catch-up can give it A's keys.
		const { forwarder, appended } = recordJournals();
		const a = createReplica({
			address: A,
			peers: [],
			journalForwarder: forwarder,
		});
		await storeOnly({ replica: a, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a] });
		for (const [key, minutesAgo] of [
			["evt_31", 31],
			["evt_29", 29],
			["evt_now", 0],
		] as const)
			await trackTakenAgo({ replica: a, appended, key, now, minutesAgo });
		const b = createReplica({ address: B, peers: [A], ready: false });
		connect({ replicas: [a, b] });

		await b.sync().catchUp();

		expect(keyRowsOn(b).map(({ appendedAt }) => appendedAt)).toEqual([
			now - 29 * MINUTE_MS,
			now,
		]);
		b.setReady(true);
		for (const key of ["evt_29", "evt_now"])
			expect(
				(await b.app.request("/v1/track", keyedTrack({ key }))).status,
			).toBe(409);
		expect(
			(await b.app.request("/v1/track", keyedTrack({ key: "evt_31" }))).status,
		).toBe(202);
	});

	test("a key it was relayed already keeps its one row when the catch-up copies it again", async () => {
		const a = createReplica({ address: A, peers: [B] });
		const b = createReplica({ address: B, peers: [A] });
		for (const replica of [a, b])
			await storeOnly({ replica, customerId: CUSTOMER, readAt: 1700 });
		connect({ replicas: [a, b] });
		await a.app.request("/v1/track", keyedTrack({ key: "evt_1" }));
		await relayLanded(() => keyRowsOn(b).length === 1);

		await b.sync().catchUp();
		await settle();

		expect(keyRowsOn(b)).toHaveLength(1);
	});
});
