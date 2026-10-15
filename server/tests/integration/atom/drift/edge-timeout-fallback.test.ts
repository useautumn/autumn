/**
 * A write check sent through the real SDK under `useEdge`, whose edge call times out, so the SDK resends it to the API.
 *
 * Contract (one deduction in Postgres, the Atom's view converging on it), for each order:
 *  1. the Atom applies it, its reply is late, and its hand-in reaches Autumn before the API fallback;
 *  2. the Atom applies it, its reply is late, and its hand-in reaches Autumn only after the API fallback applied it;
 *  3. the request reaches the Atom only after the API fallback applied it;
 *  4. as 2, for a lock.
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
/** Past the SDK's 1 s edge timeout (edgeHTTPClient.ts EDGE_TIMEOUT_MS). */
const EDGE_DELAY_MS = 1_500;

type EdgeMode = "lateReply" | "lateArrival";

type Seen = { status: number; forwarded: string | null; key: string | null };

/** A Bun server recording every reply it passes on: what the edge or the API answered, and under which key. */
const startTap = ({
	targetUrl,
	headers = {},
	mode,
}: {
	targetUrl: string;
	headers?: Record<string, string>;
	mode?: EdgeMode;
}) => {
	const seen: Seen[] = [];
	let settled = Promise.resolve();
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
				const text = await reply.text();
				seen.push({
					status: reply.status,
					forwarded: reply.headers.get("x-atom-forwarded"),
					key: sent.get("idempotency-key"),
				});
				return new Response(text, {
					status: reply.status,
					headers: { "content-type": "application/json" },
				});
			};
			// The forward runs to its end even after the SDK gives up on this call, as a real edge's would.
			if (mode === "lateArrival") {
				const done = timeout(EDGE_DELAY_MS).then(forward);
				settled = done.then(() => undefined);
				return done;
			}
			const reply = await forward();
			if (mode === "lateReply") await timeout(EDGE_DELAY_MS);
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

/** What Postgres holds of the customer's messages. */
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

/** What the Atom answers itself, from a plain check that deducts nothing. */
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
		return {
			status: (error as { statusCode?: number }).statusCode ?? null,
			error: String(error),
		};
	}
};

const runFallback = async ({
	customerId,
	mode,
	holdHandIns,
	lockId,
}: {
	customerId: string;
	mode: EdgeMode;
	holdHandIns: boolean;
	lockId?: string;
}) => {
	const { atom } = await initMessagesCustomer({ customerId, atom: replicaSet });
	const set = replicaSet();
	const edge = startTap({
		targetUrl: atom.endpointUrl,
		headers: { "x-atom-token": atom.token },
		mode,
	});
	const api = startTap({
		targetUrl: atomTestClient().baseUrl.replace(/\/v1$/, ""),
	});
	const sdk = new Autumn({
		secretKey: defaultCtx.orgSecretKey,
		serverURL: api.url,
		edgeURL: edge.url,
		useEdge: true,
		xApiVersion: LATEST_VERSION,
	});
	try {
		if (holdHandIns) set.holdHandIns();
		const startedAt = Date.now();
		const answered = await sdkCheck({ sdk, customerId, lockId });
		const sdkMs = Date.now() - startedAt;
		await edge.settled();
		const atomBeforeHandIn = await atomRemaining({ atom, customerId });
		const postgresBeforeHandIn = await postgresRemaining({ customerId });
		if (holdHandIns) await set.releaseHandIns();
		await expectAutumnLockState({ customerId, atomSeqs: [1] });
		const handedInAt = Date.now();
		await timeout(2_000);
		const postgresFinal = await postgresRemaining({ customerId });
		let atomFinal = await atomRemaining({ atom, customerId });
		await pollUntilAsserted({
			fetch: async () => {
				atomFinal = await atomRemaining({ atom, customerId });
				return atomFinal;
			},
			assert: (remaining) => expect(remaining).toBe(postgresFinal),
			timeoutMs: 120_000,
		});
		const measured = {
			customerId,
			mode,
			holdHandIns,
			lock: Boolean(lockId),
			sdk: { ...answered, ms: sdkMs },
			edgeSaw: edge.seen,
			apiSaw: api.seen,
			atomBeforeHandIn,
			postgresBeforeHandIn,
			postgresFinal,
			atomFinal,
			atomConvergedMsAfterHandIn: Date.now() - handedInAt,
			openLocks: lockId ? await openLockIdsOf({ customerId }) : undefined,
		};
		console.log(`EDGE_FALLBACK_MEASURED ${JSON.stringify(measured)}`);
		return measured;
	} finally {
		edge.stop();
		api.stop();
	}
};

const expectOneDeduction = (
	measured: Awaited<ReturnType<typeof runFallback>>,
) => {
	const key = measured.edgeSaw[0]?.key;
	expect(key).toBeTruthy();
	expect(measured.edgeSaw).toEqual([{ status: 200, forwarded: null, key }]);
	expect(measured.apiSaw.map((seen) => seen.key)).toEqual([key]);
	expect(measured.postgresFinal).toBe(INCLUDED_MESSAGES - DEDUCTED);
	expect(measured.atomFinal).toBe(INCLUDED_MESSAGES - DEDUCTED);
};

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("edge-fallback1: the Atom applies, its reply is late, its hand-in lands first: one deduction")}`,
	async () => {
		const measured = await runFallback({
			customerId: "edge-fallback1",
			mode: "lateReply",
			holdHandIns: false,
		});
		expectOneDeduction(measured);
	},
	240_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("edge-fallback2: the Atom applies, its reply is late, the API fallback lands first: one deduction")}`,
	async () => {
		const measured = await runFallback({
			customerId: "edge-fallback2",
			mode: "lateReply",
			holdHandIns: true,
		});
		expectOneDeduction(measured);
	},
	240_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("edge-fallback3: the request reaches the Atom after the API fallback applied it: one deduction")}`,
	async () => {
		const measured = await runFallback({
			customerId: "edge-fallback3",
			mode: "lateArrival",
			holdHandIns: false,
		});
		expectOneDeduction(measured);
	},
	240_000,
);

test.skipIf(!replicaSetRunsHere)(
	`${chalk.yellowBright("edge-fallback4: a lock the Atom takes with a late reply, the API fallback landing first: one hold")}`,
	async () => {
		const lockId = `edge-fallback4-${crypto.randomUUID()}`;
		const measured = await runFallback({
			customerId: "edge-fallback4",
			mode: "lateReply",
			holdHandIns: true,
			lockId,
		});
		expectOneDeduction(measured);
		expect(measured.openLocks).toEqual([lockId]);
	},
	240_000,
);
