/**
 * A finalize sent through the SDK under `useEdge`: edge-first to the Atom that took the lock, falling back to the API
 * under the same Idempotency-Key when the edge is slow.
 *
 * Contract: the lock settles once in Postgres and the Atom's view converges on it, whichever side lands first:
 *  1. the Atom settles the lock it took and answers before its hand-in reaches Autumn: the API is never asked;
 *  2. the Atom settles, its reply is late, its hand-in lands before the API's resend: the resend is 400 Lock not found;
 *  3. the Atom settles, its reply is late, the API's resend lands first: the hand-in lands only its seq;
 *  4. a lock the API took: the Atom forwards the finalize, and the SDK takes that reply without asking the API again.
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
import { expectAutumnLockState } from "../utils/autumnLockState.js";
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
/** Past the SDK's edge timeout (edgeHTTPClient.ts EDGE_TIMEOUT_MS = 1 s). */
const EDGE_DELAY_MS = 1_500;

type Seen = { path: string; status: number; key: string | null };

/** Passes every request on to `targetUrl`, after `before` and with `headers` over its own; replies `replyDelayMs` late. */
const startTap = ({
	targetUrl,
	headers = {},
	replyDelayMs = 0,
	before,
}: {
	targetUrl: string;
	headers?: Record<string, string>;
	replyDelayMs?: number;
	before?: () => Promise<void>;
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
			await before?.();
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
			if (replyDelayMs) await timeout(replyDelayMs);
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

const sdkFor = ({
	edgeUrl,
	apiUrl,
	customerId,
}: {
	edgeUrl?: string;
	apiUrl: string;
	customerId: string;
}) =>
	new Autumn({
		secretKey: defaultCtx.orgSecretKey,
		serverURL: apiUrl,
		edgeURL: edgeUrl,
		useEdge: Boolean(edgeUrl),
		retryConfig: { strategy: "none" },
		xApiVersion: LATEST_VERSION,
		failOpen: false,
		httpClient: namingCustomer({ customerId }),
	});

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

const finalizeThroughSdk = ({ sdk, lockId }: { sdk: Autumn; lockId: string }) =>
	sdk.balances
		.finalize({
			lockId,
			action: "confirm",
			overrideValue: CONFIRMED,
		})
		.then(
			(reply) => ({ status: 200, reply }),
			(error: { statusCode?: number; message?: string }) => ({
				status: error.statusCode ?? null,
				message: error.message,
			}),
		);

/** The lock settled once at its confirmed value, in Postgres and in the Atom's view. */
const expectSettledOnce = async ({
	atom,
	customerId,
	atomSeqs,
}: {
	atom: TestAtom;
	customerId: string;
	atomSeqs: number[];
}) => {
	await expectAutumnLockState({ customerId, openLockIds: [], atomSeqs });
	expect(await postgresRemaining({ customerId })).toBe(
		INCLUDED_MESSAGES - CONFIRMED,
	);
	await pollUntilAsserted({
		fetch: () => atomRemaining({ atom, customerId }),
		assert: (remaining) =>
			expect(remaining).toBe(INCLUDED_MESSAGES - CONFIRMED),
		timeoutMs: 90_000,
	});
};

const apiBaseUrl = () => atomTestClient().baseUrl.replace(/\/v1$/, "");

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("sdk-finalize-edge1: the Atom settles its own lock before the hand-in, and the API is never asked")}`,
	async () => {
		const customerId = "sdk-finalize-edge1";
		const lockId = `${customerId}-lock`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const set = replicaSet();
		const edge = startTap({
			targetUrl: atom.endpointUrl,
			headers: { "x-atom-token": atom.token },
		});
		const api = startTap({ targetUrl: apiBaseUrl() });
		const sdk = sdkFor({ edgeUrl: edge.url, apiUrl: api.url, customerId });
		try {
			set.holdHandIns();
			await lockThroughSdk({ sdk, customerId, lockId });
			const finalized = await finalizeThroughSdk({ sdk, lockId });

			expect(finalized).toEqual({ status: 200, reply: { success: true } });
			expect(api.seen).toEqual([]);
			expect(edge.seen.map(({ path }) => path)).toEqual([
				"/v1/balances.check",
				"/v1/balances.finalize",
			]);
			expect(edge.seen[1]?.key).toBeString();

			await set.releaseHandIns();
			await expectSettledOnce({ atom, customerId, atomSeqs: [2] });
		} finally {
			edge.stop();
			api.stop();
		}
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("sdk-finalize-edge2: a slow edge whose hand-in lands first: the API's resend is 400, the lock settles once")}`,
	async () => {
		const customerId = "sdk-finalize-edge2";
		const lockId = `${customerId}-lock`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const edge = startTap({
			targetUrl: atom.endpointUrl,
			headers: { "x-atom-token": atom.token },
		});
		const api = startTap({ targetUrl: apiBaseUrl() });
		const sdk = sdkFor({ edgeUrl: edge.url, apiUrl: api.url, customerId });
		const slowEdge = startTap({
			targetUrl: atom.endpointUrl,
			headers: { "x-atom-token": atom.token },
			replyDelayMs: EDGE_DELAY_MS,
		});
		const settledApi = startTap({
			targetUrl: apiBaseUrl(),
			before: () => expectAutumnLockState({ customerId, openLockIds: [] }),
		});
		try {
			await lockThroughSdk({ sdk, customerId, lockId });
			const finalized = await finalizeThroughSdk({
				sdk: sdkFor({
					edgeUrl: slowEdge.url,
					apiUrl: settledApi.url,
					customerId,
				}),
				lockId,
			});

			expect(finalized).toMatchObject({
				status: 400,
				message: expect.stringContaining("Lock not found"),
			});
			const [edgeKey] = slowEdge.seen.map(({ key }) => key);
			expect(edgeKey).toBeString();
			expect(settledApi.seen).toEqual([
				{ path: "/v1/balances.finalize", status: 400, key: edgeKey ?? null },
			]);
			await expectSettledOnce({ atom, customerId, atomSeqs: [2] });
		} finally {
			for (const tap of [edge, api, slowEdge, settledApi]) tap.stop();
		}
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("sdk-finalize-edge3: a slow edge whose resend lands first: the API settles, the hand-in lands only its seq")}`,
	async () => {
		const customerId = "sdk-finalize-edge3";
		const lockId = `${customerId}-lock`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const set = replicaSet();
		const edge = startTap({
			targetUrl: atom.endpointUrl,
			headers: { "x-atom-token": atom.token },
		});
		const api = startTap({ targetUrl: apiBaseUrl() });
		const sdk = sdkFor({ edgeUrl: edge.url, apiUrl: api.url, customerId });
		const slowEdge = startTap({
			targetUrl: atom.endpointUrl,
			headers: { "x-atom-token": atom.token },
			replyDelayMs: EDGE_DELAY_MS,
		});
		try {
			await lockThroughSdk({ sdk, customerId, lockId });
			await expectAutumnLockState({
				customerId,
				openLockIds: [lockId],
				atomSeqs: [1],
			});
			set.holdHandIns();
			const finalized = await finalizeThroughSdk({
				sdk: sdkFor({ edgeUrl: slowEdge.url, apiUrl: api.url, customerId }),
				lockId,
			});

			expect(finalized).toEqual({ status: 200, reply: { success: true } });
			const [edgeKey] = slowEdge.seen.map(({ key }) => key);
			expect(edgeKey).toBeString();
			expect(api.seen).toEqual([
				{ path: "/v1/balances.finalize", status: 200, key: edgeKey ?? null },
			]);
			await expectAutumnLockState({ customerId, openLockIds: [] });
			expect(await postgresRemaining({ customerId })).toBe(
				INCLUDED_MESSAGES - CONFIRMED,
			);

			await set.releaseHandIns();
			await expectSettledOnce({ atom, customerId, atomSeqs: [2] });
		} finally {
			for (const tap of [edge, api, slowEdge]) tap.stop();
		}
	},
	120_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("sdk-finalize-edge4: a lock the API took is finalized through the Atom's forward, never resent to the API")}`,
	async () => {
		const customerId = "sdk-finalize-edge4";
		const lockId = `${customerId}-lock`;
		const { atom } = await initMessagesCustomer({
			customerId,
			atom: replicaSet,
		});
		const edge = startTap({
			targetUrl: atom.endpointUrl,
			headers: { "x-atom-token": atom.token },
		});
		const api = startTap({ targetUrl: apiBaseUrl() });
		try {
			await lockThroughSdk({
				sdk: sdkFor({ apiUrl: api.url, customerId }),
				customerId,
				lockId,
			});
			const finalized = await finalizeThroughSdk({
				sdk: sdkFor({ edgeUrl: edge.url, apiUrl: api.url, customerId }),
				lockId,
			});

			expect(finalized).toEqual({ status: 200, reply: { success: true } });
			expect(api.seen.map(({ path }) => path)).toEqual(["/v1/balances.check"]);
			expect(edge.seen.map(({ path }) => path)).toEqual([
				"/v1/balances.finalize",
			]);
			await expectAutumnLockState({ customerId, openLockIds: [] });
			expect(await postgresRemaining({ customerId })).toBe(
				INCLUDED_MESSAGES - CONFIRMED,
			);
		} finally {
			edge.stop();
			api.stop();
		}
	},
	120_000,
);
