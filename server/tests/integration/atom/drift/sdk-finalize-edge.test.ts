/**
 * A finalize sent through the SDK under `useEdge` goes edge-first to the Atom that took the lock, which journals it as
 * sent, behind the lock, and answers success once the append commits; Autumn decides it where the journal lands.
 *
 * Contract:
 *  1. a lock then a finalize on the same Atom settles exactly once, in Postgres and in the Atom's view after the push;
 *     the API is never asked, and the Atom's view keeps the lock held until that push;
 *  2. release, confirm and override_value each settle at the value their action names;
 *  3. a retry under the same Idempotency-Key is answered success and never settles the lock twice;
 *  4. a finalize of a lock never taken is answered success, and nothing changes in Autumn;
 *  5. a hand-in delayed past the lock's still lands the finalize after its lock;
 *  6. a customer the Atom holds no subject for is answered success too: the async path reads neither the subject nor the lock.
 *
 * Red on dev: the Atom decides the finalize itself (1 settles its view at once; 4 and 6 are 400 from the API), and
 * Autumn's hand-in has no undecided member.
 */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	customers,
	LATEST_VERSION,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { pollUntilAsserted, timeout } from "@tests/utils/genUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { and, eq, sum } from "drizzle-orm";
import { HTTPClient } from "../../../../../packages/sdk/src/lib/http.js";
import { Autumn } from "../../../../../packages/sdk/src/sdk/sdk.js";
import { atomTestClient } from "../utils/atomTestClient.js";
import {
	atomSeqsOf,
	expectAutumnLockState,
	openLockIdsOf,
} from "../utils/autumnLockState.js";
import type { TestAtom } from "../utils/ensureAtomDeployment.js";
import { checkOnAtom } from "../utils/expectAtomCheckCorrect.js";
import {
	replicaSetRunsHere,
	useReplicaSet,
} from "../utils/replicaSet/useReplicaSet.js";
import {
	INCLUDED_MESSAGES,
	initMessagesCustomer,
} from "./utils/initMessagesCustomer.js";

const replicaSet = useReplicaSet({ size: 1 });

const LOCKED = 30;
const CONFIRMED = 10;
/** Long enough for a hand-in and its push to have landed had they been sent. */
const SETTLE_WAIT_MS = 3_000;

type Seen = { path: string; status: number; key: string | null };

/** Passes every request on to `targetUrl`, with `headers` over its own, recording each one's path, status and key. */
const startTap = ({
	targetUrl,
	headers = {},
}: {
	targetUrl: string;
	headers?: Record<string, string>;
}) => {
	const seen: Seen[] = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		idleTimeout: 0,
		async fetch(request) {
			const body = await request.arrayBuffer();
			const sent = new Headers(request.headers);
			sent.delete("host");
			for (const [name, value] of Object.entries(headers))
				sent.set(name, value);
			const { pathname, search } = new URL(request.url);
			const reply = await fetch(`${targetUrl}${pathname}${search}`, {
				method: request.method,
				headers: sent,
				body,
			});
			const text = await reply.text();
			seen.push({
				path: pathname,
				status: reply.status,
				key: sent.get("idempotency-key"),
			});
			const replied = new Headers({ "content-type": "application/json" });
			const forwarded = reply.headers.get("x-atom-forwarded");
			if (forwarded) replied.set("x-atom-forwarded", forwarded);
			return new Response(text, { status: reply.status, headers: replied });
		},
	});
	return {
		url: `http://127.0.0.1:${server.port}`,
		seen,
		stop: () => server.stop(true),
	};
};

const postgresRemaining = async ({ customerId }: { customerId: string }) => {
	const [row] = await defaultCtx.db
		.select({ remaining: sum(customerEntitlements.balance) })
		.from(customerEntitlements)
		.innerJoin(
			customers,
			eq(customers.internal_id, customerEntitlements.internal_customer_id),
		)
		.where(
			and(
				eq(customers.org_id, defaultCtx.org.id),
				eq(customers.env, defaultCtx.env),
				eq(customers.id, customerId),
			),
		);
	return Number(row?.remaining);
};

const atomRemaining = async ({
	atom,
	customerId,
}: {
	atom: TestAtom;
	customerId: string;
}) => {
	const reply = await checkOnAtom({
		atom,
		secretKey: defaultCtx.orgSecretKey,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(reply.forwarded).toBeNull();
	return (reply.body as { balance: { remaining: number } }).balance.remaining;
};

/** The generated SDK's finalize has no `customer_id` yet (2.6 requires it), so it is added on the wire. */
const namingCustomer = ({ customerId }: { customerId: string }) =>
	new HTTPClient({
		fetcher: async (input, init) => {
			const request = new Request(input, init);
			if (!request.url.endsWith("/v1/balances.finalize")) return fetch(request);
			const body = { ...(await request.json()), customer_id: customerId };
			return fetch(new Request(request, { body: JSON.stringify(body) }));
		},
	});

const apiBaseUrl = () => atomTestClient().baseUrl.replace(/\/v1$/, "");

/** The SDK under `useEdge`, its edge and API calls each passing through a tap. */
const sdkThroughTaps = ({
	atom,
	customerId,
}: {
	atom: TestAtom;
	customerId: string;
}) => {
	const edge = startTap({
		targetUrl: atom.endpointUrl,
		headers: { "x-atom-token": atom.token },
	});
	const api = startTap({ targetUrl: apiBaseUrl() });
	const sdk = new Autumn({
		secretKey: defaultCtx.orgSecretKey,
		serverURL: api.url,
		edgeURL: edge.url,
		useEdge: true,
		retryConfig: { strategy: "none" },
		xApiVersion: LATEST_VERSION,
		failOpen: false,
		httpClient: namingCustomer({ customerId }),
	});
	return {
		sdk,
		edge,
		api,
		stop: () => {
			edge.stop();
			api.stop();
		},
	};
};

const lockThroughSdk = async ({
	sdk,
	customerId,
	lockId,
}: {
	sdk: Autumn;
	customerId: string;
	lockId: string;
}) => {
	const locked = await sdk.check({
		customerId,
		featureId: TestFeature.Messages,
		requiredBalance: LOCKED,
		lock: { enabled: true, lockId },
	});
	expect(locked.allowed).toBe(true);
};

type FinalizeAction =
	| { action: "release" }
	| { action: "confirm"; overrideValue?: number };

const finalizeThroughSdk = ({
	sdk,
	customerId,
	lockId,
	finalize = { action: "confirm", overrideValue: CONFIRMED },
	idempotencyKey,
}: {
	sdk: Autumn;
	customerId: string;
	lockId: string;
	finalize?: FinalizeAction;
	idempotencyKey?: string;
}) => {
	// Not a literal: dev's SDK lacks customerId (excess-property error), main's regenerated SDK requires it.
	const params = { customerId, lockId, ...finalize };
	return sdk.balances
		.finalize(
			params,
			idempotencyKey
				? { fetchOptions: { headers: { "Idempotency-Key": idempotencyKey } } }
				: undefined,
		)
		.then(
			(reply) => ({ status: 200, reply }),
			(error: { statusCode?: number; message?: string }) => ({
				status: error.statusCode ?? null,
				message: error.message,
			}),
		);
};

/** Autumn holds the lock closed at `remaining`, with these seqs landed, and the Atom's view has converged on it. */
const expectSettled = async ({
	atom,
	customerId,
	remaining,
	atomSeqs,
}: {
	atom: TestAtom;
	customerId: string;
	remaining: number;
	atomSeqs?: number[];
}) => {
	await expectAutumnLockState({ customerId, openLockIds: [], atomSeqs });
	// Polled: no open lock row is also what the row looks like before the lock's own hand-in lands.
	await pollUntilAsserted({
		fetch: () => postgresRemaining({ customerId }),
		assert: (seen) => expect(seen).toBe(remaining),
	});
	await pollUntilAsserted({
		fetch: () => atomRemaining({ atom, customerId }),
		assert: (seen) => expect(seen).toBe(remaining),
		timeoutMs: 90_000,
	});
};

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("sdk-finalize-edge1: a lock then a finalize settles once, in Postgres and in the Atom's view after the push; the API is never asked")}`,
	async () => {
		const customerId = "sdk-finalize-edge1";
		const lockId = `${customerId}-lock`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const set = replicaSet();
		const taps = sdkThroughTaps({ atom, customerId });
		try {
			set.holdHandIns();
			await lockThroughSdk({ sdk: taps.sdk, customerId, lockId });
			const finalized = await finalizeThroughSdk({
				sdk: taps.sdk,
				customerId,
				lockId,
			});

			expect(finalized).toEqual({ status: 200, reply: { success: true } });
			expect(taps.api.seen).toEqual([]);
			expect(taps.edge.seen.map(({ path }) => path)).toEqual([
				"/v1/balances.check",
				"/v1/balances.finalize",
			]);
			expect(taps.edge.seen[1]?.key).toBeString();
			// Nothing is decided on the Atom: its view holds the lock until Autumn's push shows it settled.
			expect(await atomRemaining({ atom, customerId })).toBe(
				INCLUDED_MESSAGES - LOCKED,
			);
			await expectAutumnLockState({
				customerId,
				openLockIds: [],
				atomSeqs: [],
			});

			await set.releaseHandIns();
			await expectSettled({
				atom,
				customerId,
				remaining: INCLUDED_MESSAGES - CONFIRMED,
				atomSeqs: [2],
			});
		} finally {
			taps.stop();
		}
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("sdk-finalize-edge2: release, confirm and override_value each settle at the value their action names")}`,
	async () => {
		const customerId = "sdk-finalize-edge2";
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const taps = sdkThroughTaps({ atom, customerId });
		const actions: [string, FinalizeAction][] = [
			["release", { action: "release" }],
			["confirm", { action: "confirm" }],
			["override", { action: "confirm", overrideValue: CONFIRMED }],
		];
		try {
			for (const [name, finalize] of actions) {
				const lockId = `${customerId}-${name}`;
				await lockThroughSdk({ sdk: taps.sdk, customerId, lockId });
				expect(
					await finalizeThroughSdk({
						sdk: taps.sdk,
						customerId,
						lockId,
						finalize,
					}),
				).toEqual({ status: 200, reply: { success: true } });
			}

			expect(taps.api.seen).toEqual([]);
			await expectSettled({
				atom,
				customerId,
				remaining: INCLUDED_MESSAGES - LOCKED - CONFIRMED,
				atomSeqs: [6],
			});
		} finally {
			taps.stop();
		}
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("sdk-finalize-edge3: a retry under the same Idempotency-Key is answered success and never settles the lock twice")}`,
	async () => {
		const customerId = "sdk-finalize-edge3";
		const lockId = `${customerId}-lock`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const taps = sdkThroughTaps({ atom, customerId });
		const idempotencyKey = `${customerId}-key`;
		try {
			await lockThroughSdk({ sdk: taps.sdk, customerId, lockId });
			const [first, retry] = await Promise.all([
				finalizeThroughSdk({
					sdk: taps.sdk,
					customerId,
					lockId,
					idempotencyKey,
				}),
				finalizeThroughSdk({
					sdk: taps.sdk,
					customerId,
					lockId,
					idempotencyKey,
				}),
			]);

			expect([first, retry]).toEqual([
				{ status: 200, reply: { success: true } },
				{ status: 200, reply: { success: true } },
			]);
			expect(taps.api.seen).toEqual([]);
			expect(
				taps.edge.seen
					.filter(({ path }) => path === "/v1/balances.finalize")
					.map(({ key }) => key),
			).toEqual([idempotencyKey, idempotencyKey]);
			await expectSettled({
				atom,
				customerId,
				remaining: INCLUDED_MESSAGES - CONFIRMED,
			});
			await timeout(SETTLE_WAIT_MS);
			expect(await postgresRemaining({ customerId })).toBe(
				INCLUDED_MESSAGES - CONFIRMED,
			);
		} finally {
			taps.stop();
		}
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("sdk-finalize-edge4: a finalize of a lock never taken is answered success, and nothing changes in Autumn")}`,
	async () => {
		const customerId = "sdk-finalize-edge4";
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const taps = sdkThroughTaps({ atom, customerId });
		try {
			await lockThroughSdk({
				sdk: taps.sdk,
				customerId,
				lockId: `${customerId}-held`,
			});
			await expectAutumnLockState({
				customerId,
				openLockIds: [`${customerId}-held`],
				atomSeqs: [1],
			});

			const finalized = await finalizeThroughSdk({
				sdk: taps.sdk,
				customerId,
				lockId: `${customerId}-never-taken`,
			});

			expect(finalized).toEqual({ status: 200, reply: { success: true } });
			expect(taps.api.seen).toEqual([]);
			await timeout(SETTLE_WAIT_MS);
			expect(await openLockIdsOf({ customerId })).toEqual([
				`${customerId}-held`,
			]);
			expect(await atomSeqsOf({ customerId })).toEqual([1]);
			expect(await postgresRemaining({ customerId })).toBe(
				INCLUDED_MESSAGES - LOCKED,
			);
			expect(await atomRemaining({ atom, customerId })).toBe(
				INCLUDED_MESSAGES - LOCKED,
			);
		} finally {
			taps.stop();
		}
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("sdk-finalize-edge5: a hand-in delayed past the lock's still lands the finalize after its lock")}`,
	async () => {
		const customerId = "sdk-finalize-edge5";
		const lockId = `${customerId}-lock`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const set = replicaSet();
		const taps = sdkThroughTaps({ atom, customerId });
		try {
			await lockThroughSdk({ sdk: taps.sdk, customerId, lockId });
			await expectAutumnLockState({
				customerId,
				openLockIds: [lockId],
				atomSeqs: [1],
			});
			set.holdHandIns();
			const finalized = await finalizeThroughSdk({
				sdk: taps.sdk,
				customerId,
				lockId,
			});

			expect(finalized).toEqual({ status: 200, reply: { success: true } });
			expect(taps.api.seen).toEqual([]);
			await timeout(SETTLE_WAIT_MS);
			expect(await openLockIdsOf({ customerId })).toEqual([lockId]);
			expect(await atomSeqsOf({ customerId })).toEqual([1]);

			await set.releaseHandIns();
			await expectSettled({
				atom,
				customerId,
				remaining: INCLUDED_MESSAGES - CONFIRMED,
				atomSeqs: [2],
			});
		} finally {
			taps.stop();
		}
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("sdk-finalize-edge6: a customer the Atom holds no subject for is answered success: the async path reads neither the subject nor the lock")}`,
	async () => {
		const customerId = "sdk-finalize-edge6";
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const ghostId = `${customerId}-never-stored`;
		const taps = sdkThroughTaps({ atom, customerId: ghostId });
		try {
			const finalized = await finalizeThroughSdk({
				sdk: taps.sdk,
				customerId: ghostId,
				lockId: `${ghostId}-lock`,
			});

			expect(finalized).toEqual({ status: 200, reply: { success: true } });
			expect(taps.api.seen).toEqual([]);
			expect(taps.edge.seen).toEqual([
				{ path: "/v1/balances.finalize", status: 200, key: expect.any(String) },
			]);
			await timeout(SETTLE_WAIT_MS);
			expect(await openLockIdsOf({ customerId: ghostId })).toEqual([]);
			expect(await atomRemaining({ atom, customerId })).toBe(INCLUDED_MESSAGES);
		} finally {
			taps.stop();
		}
	},
	120_000,
);
