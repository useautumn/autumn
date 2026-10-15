/**
 * A write check sent through the SDK under `useEdge` whose edge call times out, so the SDK resends it, under the same
 * Idempotency-Key, to the API. The Atom's hand-in claims that key where the API's middleware does.
 *
 * Contract: one deduction in Postgres, and the Atom's view converging on it, whichever side lands first:
 *  1. the Atom applies, its reply is late, its hand-in lands first: the API's resend is 409;
 *  2. the Atom applies, its reply is late, the API's resend lands first: the hand-in lands only its seq;
 *  3. the request reaches the Atom after the API applied it: the Atom shows two until its hand-in settles;
 *  4. as 2, for a lock: one hold;
 *  5. as 2, but the API cannot reach the worker and fails open: the key is freed, so the hand-in deducts;
 *  6. as 2, but the org is over its write cap: the API's 429 frees the key, so the hand-in deducts.
 */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	customers,
	LATEST_VERSION,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { pollUntilAsserted, timeout } from "@tests/utils/genUtils.js";
import { setServerRateLimitOverride } from "@tests/utils/serverEdgeConfigTestUtils.js";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { and, eq, sum } from "drizzle-orm";
import { RateLimitType } from "@/internal/misc/rateLimiter/rateLimitConfigs.js";
import { Autumn } from "../../../../../packages/sdk/src/sdk/sdk.js";
import { atomTestClient } from "../utils/atomTestClient.js";
import {
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

const DEDUCTED = 10;
/** Past the SDK's edge timeout (edgeHTTPClient.ts EDGE_TIMEOUT_MS = 1 s). */
const EDGE_DELAY_MS = 1_500;

/** The edge forwards at once and replies late, or forwards late: the Atom applies before or after the API. */
type EdgeDelay = "lateReply" | "lateArrival";

type Seen = { status: number; key: string | null };

/** A server passing every request on to `targetUrl` with `headers` over its own, keeping each reply's status and key. */
const startTap = ({
	targetUrl,
	headers = {},
	delay,
}: {
	targetUrl: string;
	headers?: Record<string, string>;
	delay?: EdgeDelay;
}) => {
	const seen: Seen[] = [];
	let settled: Promise<unknown> = Promise.resolve();
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const body = await request.arrayBuffer();
			const sent = new Headers(request.headers);
			sent.delete("host");
			for (const [name, value] of Object.entries(headers))
				sent.set(name, value);
			const forward = async () => {
				const { pathname, search } = new URL(request.url);
				const reply = await fetch(`${targetUrl}${pathname}${search}`, {
					method: request.method,
					headers: sent,
					body,
				});
				seen.push({ status: reply.status, key: sent.get("idempotency-key") });
				return new Response(await reply.text(), {
					status: reply.status,
					headers: { "content-type": "application/json" },
				});
			};
			// Runs to its end after the SDK gives up on the call, as a real edge's forward does.
			if (delay === "lateArrival") {
				const forwarded = timeout(EDGE_DELAY_MS).then(forward);
				settled = forwarded;
				return forwarded;
			}
			const reply = await forward();
			if (delay === "lateReply") await timeout(EDGE_DELAY_MS);
			return reply;
		},
	});
	return {
		url: `http://127.0.0.1:${server.port}`,
		seen,
		settled: () => settled,
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

/** What the Atom answers itself, from a check that deducts nothing. */
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

/** The SDK's answer, or the status it threw with. */
const sdkCheck = async ({
	sdk,
	customerId,
	lockId,
}: {
	sdk: Autumn;
	customerId: string;
	lockId?: string;
}) => {
	try {
		const reply = await sdk.check({
			customerId,
			featureId: TestFeature.Messages,
			requiredBalance: DEDUCTED,
			...(lockId ? { lock: { lockId, enabled: true } } : { sendEvent: true }),
		});
		return { status: 200, allowed: reply.allowed };
	} catch (error) {
		return { status: (error as { statusCode?: number }).statusCode ?? null };
	}
};

/**
 * One SDK write check through a slow edge, with the Atom's hand-ins held until the call is over when `apiFirst`.
 * Resolves with what each side saw and held, once the Atom's view agrees with Postgres.
 */
const sendThroughSlowEdge = async ({
	customerId,
	delay,
	apiFirst,
	apiHeaders,
	lockId,
}: {
	customerId: string;
	delay: EdgeDelay;
	apiFirst: boolean;
	apiHeaders?: Record<string, string>;
	lockId?: string;
}) => {
	const { atom } = await initMessagesCustomer({ customerId, atom: replicaSet });
	const set = replicaSet();
	const edge = startTap({
		targetUrl: atom.endpointUrl,
		headers: { "x-atom-token": atom.token },
		delay,
	});
	const api = startTap({
		targetUrl: atomTestClient().baseUrl.replace(/\/v1$/, ""),
		headers: apiHeaders,
	});
	const sdk = new Autumn({
		secretKey: defaultCtx.orgSecretKey,
		serverURL: api.url,
		edgeURL: edge.url,
		useEdge: true,
		retryConfig: { strategy: "none" },
		xApiVersion: LATEST_VERSION,
	});
	try {
		if (apiFirst) set.holdHandIns();
		const answered = await sdkCheck({ sdk, customerId, lockId });
		await edge.settled();
		const atomBeforeHandIn = await atomRemaining({ atom, customerId });
		if (apiFirst) await set.releaseHandIns();
		await expectAutumnLockState({ customerId, atomSeqs: [1] });
		const postgres = await postgresRemaining({ customerId });
		await pollUntilAsserted({
			fetch: () => atomRemaining({ atom, customerId }),
			assert: (remaining) => expect(remaining).toBe(postgres),
			timeoutMs: 90_000,
		});
		return {
			answered,
			edgeSaw: edge.seen,
			apiSaw: api.seen,
			atomBeforeHandIn,
			postgres,
			openLockIds: await openLockIdsOf({ customerId }),
		};
	} finally {
		edge.stop();
		api.stop();
	}
};

type Sent = Awaited<ReturnType<typeof sendThroughSlowEdge>>;

/** The Atom applied and both sides were sent the SDK's one key; Postgres holds one deduction. */
const expectOneDeduction = ({
	sent,
	apiStatus,
}: {
	sent: Sent;
	apiStatus: number;
}) => {
	const key = sent.edgeSaw[0]?.key;
	expect(key).toBeTruthy();
	expect(sent.edgeSaw).toEqual([{ status: 200, key }]);
	expect(sent.apiSaw).toEqual([{ status: apiStatus, key }]);
	expect(sent.postgres).toBe(INCLUDED_MESSAGES - DEDUCTED);
};

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("edge-fallback1: the Atom applies, its reply is late, its hand-in lands first: the API's resend is 409, one deduction")}`,
	async () => {
		const sent = await sendThroughSlowEdge({
			customerId: "edge-fallback1",
			delay: "lateReply",
			apiFirst: false,
		});
		expectOneDeduction({ sent, apiStatus: 409 });
		expect(sent.answered.status).toBe(409);
	},
	240_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("edge-fallback2: the Atom applies, its reply is late, the API's resend lands first: one deduction")}`,
	async () => {
		const sent = await sendThroughSlowEdge({
			customerId: "edge-fallback2",
			delay: "lateReply",
			apiFirst: true,
		});
		expectOneDeduction({ sent, apiStatus: 200 });
		expect(sent.answered).toEqual({ status: 200, allowed: true });
	},
	240_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("edge-fallback3: the request reaches the Atom after the API applied it: the Atom's double settles to one deduction")}`,
	async () => {
		const sent = await sendThroughSlowEdge({
			customerId: "edge-fallback3",
			delay: "lateArrival",
			apiFirst: false,
		});
		expectOneDeduction({ sent, apiStatus: 200 });
		expect(sent.atomBeforeHandIn).toBe(INCLUDED_MESSAGES - 2 * DEDUCTED);
	},
	240_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("edge-fallback4: a lock the Atom takes with a late reply, the API's resend landing first: one hold")}`,
	async () => {
		const lockId = `edge-fallback4-${crypto.randomUUID()}`;
		const sent = await sendThroughSlowEdge({
			customerId: "edge-fallback4",
			delay: "lateReply",
			apiFirst: true,
			lockId,
		});
		expectOneDeduction({ sent, apiStatus: 200 });
		expect(sent.openLockIds).toEqual([lockId]);
	},
	240_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("edge-fallback5: the API's resend fails open without the worker: the key is freed, and the Atom's deduction lands")}`,
	async () => {
		const sent = await sendThroughSlowEdge({
			customerId: "edge-fallback5",
			delay: "lateReply",
			apiFirst: true,
			apiHeaders: { "x-balance-worker-outage": "true" },
		});
		expectOneDeduction({ sent, apiStatus: 202 });
	},
	240_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("edge-fallback6: the org is over its write cap: the API's 429 frees the key, and the Atom's deduction lands")}`,
	async () => {
		const override = await setServerRateLimitOverride({
			ctx: defaultCtx,
			orgKey: defaultCtx.org.id,
			limits: { [RateLimitType.SyncBalanceWriteOrg]: 0 },
		});
		try {
			const sent = await sendThroughSlowEdge({
				customerId: "edge-fallback6",
				delay: "lateReply",
				apiFirst: true,
			});
			expectOneDeduction({ sent, apiStatus: 429 });
		} finally {
			await override.restore();
		}
	},
	240_000,
);
