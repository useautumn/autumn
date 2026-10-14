import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { getServerBalanceWorkerRolloutPercent } from "@tests/utils/rolloutTestUtils.js";
import testCtx, {
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	_resetReplicaRoutingStateForTesting,
	_setReplicaRoutingProbeForTesting,
} from "@/db/replicaRoutingState.js";
import {
	_setLedgerDbOverrideForTesting,
	_setReplicaDbOverrideForTesting,
	resolveSubjectReadDb,
} from "@/db/resolveSubjectReadDb.js";
import { setCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setCachedFullSubject.js";
import { isReplicaSourced } from "@/internal/customers/cache/fullSubject/subjectProvenance.js";
import { _resetRecentlyUpdatedNegativeCacheForTesting } from "@/internal/customers/customerLsns/isCustomerRecentlyUpdated.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";

const envBase = process.env.AUTUMN_TEST_BASE_URL;
const baseUrl = envBase
	? `${envBase.replace(/\/$/, "")}/v1`
	: "http://localhost:8080/v1";

const DEBUG_HEADERS = { "x-debug-subject-source": "true" };
const SKIP_CACHE_DEBUG_HEADERS = { ...DEBUG_HEADERS, "x-skip-cache": "true" };

const rpcPost = async ({
	ctx,
	path,
	body,
	headers = {},
}: {
	ctx: TestContext;
	path: string;
	body: unknown;
	headers?: Record<string, string>;
}) => {
	const response = await fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${ctx.orgSecretKey}`,
			"Content-Type": "application/json",
			"x-api-version": ApiVersion.V2_3,
			...headers,
		},
		body: JSON.stringify(body),
	});
	const json = (await response.json()) as { id?: string };
	return {
		status: response.status,
		json,
		customerId: json.id,
		subjectSource: response.headers.get("x-subject-source"),
	};
};

const preAgeLedger = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	await ctx.db.execute(sql`
		UPDATE customer_lsns
		SET updated_at = now() - interval '2 minutes'
		WHERE org_id = ${ctx.org.id}
			AND env = ${ctx.env}
			AND customer_id = ${customerId}
	`);
};

const REPLICA_CATCHUP_MS = 1_500;

const workerServesCustomerReads =
	(await getServerBalanceWorkerRolloutPercent({ org: testCtx.org })) === 100;
const legacyReadTest = test.concurrent.skipIf(workerServesCustomerReads);
const legacyReadTitle = (title: string) =>
	chalk.yellowBright(
		workerServesCustomerReads
			? `${title} [skipped: customer reads go through the balance worker at 100% rollout; replica routing for worker reads is untested]`
			: title,
	);

legacyReadTest(
	legacyReadTitle(
		"replica-reads (a): quiet customer + skipCache read is served by the replica",
	),
	async () => {
		const customerId = "replica-read-quiet-customer";
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await timeout(REPLICA_CATCHUP_MS);
		await preAgeLedger({ ctx, customerId });

		const res = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
			headers: SKIP_CACHE_DEBUG_HEADERS,
		});

		expect(res.status).toBe(200);
		expect(res.customerId).toBe(customerId);
		expect(res.subjectSource).toBe("replica");
	},
);

legacyReadTest(
	legacyReadTitle(
		"replica-reads (b): freshly attached customer + skipCache read pins primary (read-your-writes)",
	),
	async () => {
		const customerId = "replica-read-fresh-write-customer";
		const pro = products.pro({
			id: "replica-read-pro-b",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const res = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
			headers: SKIP_CACHE_DEBUG_HEADERS,
		});

		expect(res.status).toBe(200);
		expect(res.customerId).toBe(customerId);
		expect(res.subjectSource).toBe("primary");
	},
);

legacyReadTest(
	legacyReadTitle(
		"replica-reads (c): get_or_create of an existing quiet customer serves the lookup from the replica",
	),
	async () => {
		const customerId = "replica-read-goc-existing";
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await timeout(REPLICA_CATCHUP_MS);
		await preAgeLedger({ ctx, customerId });

		const res = await rpcPost({
			ctx,
			path: "/customers.get_or_create",
			body: { customer_id: customerId },
			headers: SKIP_CACHE_DEBUG_HEADERS,
		});

		expect(res.status).toBe(200);
		expect(res.customerId).toBe(customerId);
		expect(res.subjectSource).toBe("replica");
	},
);

legacyReadTest(
	legacyReadTitle(
		"replica-reads (d): get_or_create of a brand-new customer creates via primary; follow-up read pins primary",
	),
	async () => {
		const customerId = "replica-read-goc-brand-new";
		const { ctx, autumnV1 } = await initScenario({
			setup: [],
			actions: [],
		});
		await autumnV1.customers.delete(customerId).catch(() => undefined);

		const created = await rpcPost({
			ctx,
			path: "/customers.get_or_create",
			body: { customer_id: customerId },
			headers: SKIP_CACHE_DEBUG_HEADERS,
		});
		expect(created.status).toBe(200);
		expect(created.customerId).toBe(customerId);

		const followUp = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
			headers: SKIP_CACHE_DEBUG_HEADERS,
		});
		expect(followUp.status).toBe(200);
		expect(followUp.customerId).toBe(customerId);
		expect(followUp.subjectSource).toBe("primary");
	},
);

legacyReadTest(
	legacyReadTitle(
		"replica-reads (e): reads without skipCache stay on the cache path and emit no header without the debug opt-in",
	),
	async () => {
		const customerId = "replica-read-cache-path";
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const first = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
			headers: DEBUG_HEADERS,
		});
		expect(first.status).toBe(200);
		expect(first.customerId).toBe(customerId);
		expect(["cache", "primary"]).toContain(first.subjectSource ?? "missing");

		await timeout(1_200);
		const second = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
			headers: DEBUG_HEADERS,
		});
		expect(second.status).toBe(200);
		expect(second.customerId).toBe(customerId);
		expect(second.subjectSource).toBe("cache");

		const noDebug = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
		});
		expect(noDebug.status).toBe(200);
		expect(noDebug.customerId).toBe(customerId);
		expect(noDebug.subjectSource).toBeNull();
	},
);

test(`${chalk.yellowBright("replica-reads (f): resolveSubjectReadDb fail-safes and one-shot primary retry on replica failure")}`, async () => {
	const customerId = "replica-read-service-failsafe";
	const { ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});
	const skipCacheCtx = { ...ctx, skipCache: true };
	const baseArgs = { orgId: ctx.org.id, env: ctx.env, customerId };

	try {
		_resetReplicaRoutingStateForTesting();
		const ineligible = await resolveSubjectReadDb({
			ctx: skipCacheCtx,
			readFrom: "replica-ok",
			...baseArgs,
		});
		expect(ineligible.source).toBe("primary");
		expect(ineligible.db).toBe(ctx.db);

		_setReplicaRoutingProbeForTesting({ replicaCount: 2, maxReplayLagMs: 0 });
		await preAgeLedger({ ctx, customerId });
		const eligible = await resolveSubjectReadDb({
			ctx: skipCacheCtx,
			readFrom: "replica-ok",
			...baseArgs,
		});
		expect(eligible.source).toBe("replica");

		const explicitPrimary = await resolveSubjectReadDb({
			ctx: skipCacheCtx,
			readFrom: "primary",
			...baseArgs,
		});
		expect(explicitPrimary.source).toBe("primary");
		const cachePathCtx = await resolveSubjectReadDb({
			ctx,
			readFrom: "replica-ok",
			...baseArgs,
		});
		expect(cachePathCtx.source).toBe("primary");

		_resetRecentlyUpdatedNegativeCacheForTesting();

		const throwingLedgerDb = {
			execute: () => Promise.reject(new Error("ledger unavailable")),
		} as unknown as DrizzleCli;
		_setLedgerDbOverrideForTesting(throwingLedgerDb);
		try {
			const ledgerError = await resolveSubjectReadDb({
				ctx: skipCacheCtx,
				readFrom: "replica-ok",
				...baseArgs,
			});
			expect(ledgerError.source).toBe("primary");
		} finally {
			_setLedgerDbOverrideForTesting(null);
		}

		const brokenReplicaDb = {
			$client: {
				query: () => Promise.reject(new Error("replica exploded")),
			},
			execute: () => Promise.reject(new Error("replica exploded")),
		} as unknown as DrizzleCli;
		_setReplicaDbOverrideForTesting(brokenReplicaDb);
		const result = await getFullSubjectNormalized({
			ctx: skipCacheCtx,
			customerId,
			readFrom: "replica-ok",
		});
		expect(result).toBeDefined();
		expect(result?.fullSubject.customer.id).toBe(customerId);
		expect(isReplicaSourced(result?.normalized as object)).toBe(false);
		expect(isReplicaSourced(result?.fullSubject as object)).toBe(false);
	} finally {
		_setReplicaDbOverrideForTesting(null);
		_resetReplicaRoutingStateForTesting();
	}
});

test(`${chalk.yellowBright("replica-reads (g): replica-sourced subjects are branded and rejected by setCachedFullSubject")}`, async () => {
	const customerId = "replica-read-provenance";
	const { ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await timeout(REPLICA_CATCHUP_MS);
	await preAgeLedger({ ctx, customerId });
	_setReplicaRoutingProbeForTesting({ replicaCount: 2, maxReplayLagMs: 0 });

	try {
		const result = await getFullSubjectNormalized({
			ctx: { ...ctx, skipCache: true },
			customerId,
			readFrom: "replica-ok",
		});
		expect(result).toBeDefined();
		if (!result) throw new Error("expected a replica-routed hydration");

		expect(isReplicaSourced(result.normalized)).toBe(true);
		expect(isReplicaSourced(result.fullSubject)).toBe(true);

		await expect(
			setCachedFullSubject({
				ctx,
				normalized: result.normalized,
				fetchedSubjectViewEpoch: 0,
			}),
		).rejects.toThrow(/replica-sourced/);
	} finally {
		_resetReplicaRoutingStateForTesting();
	}
});
