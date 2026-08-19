import { customerEntitlements } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/initDrizzle.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";

export interface RawCusEntRow {
	id: string;
	feature_id: string | null;
	balance: number;
	unlimited: boolean | null;
}

/**
 * Reads the raw `customer_entitlements` rows for a customer straight from
 * Postgres — deliberately bypassing the API, which masks unlimited balances
 * to zero. The unlimited-deduction feature asserts on this raw balance.
 */
export const getRawCusEntRows = async ({
	internalCustomerId,
}: {
	internalCustomerId: string;
}): Promise<RawCusEntRow[]> =>
	db
		.select({
			id: customerEntitlements.id,
			feature_id: customerEntitlements.feature_id,
			balance: customerEntitlements.balance,
			unlimited: customerEntitlements.unlimited,
		})
		.from(customerEntitlements)
		.where(eq(customerEntitlements.internal_customer_id, internalCustomerId));

const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Track lands in Redis first and flushes to Postgres lazily, so poll the raw
 * cusEnt row until its balance reaches `expectedBalance` (or the timeout
 * elapses — the caller's assertion then reports the last value seen).
 */
export const pollRawCusEntBalance = async ({
	internalCustomerId,
	featureId,
	expectedBalance,
	timeoutMs = POLL_TIMEOUT_MS,
}: {
	internalCustomerId: string;
	featureId: string;
	expectedBalance: number;
	timeoutMs?: number;
}): Promise<RawCusEntRow | undefined> => {
	const deadline = Date.now() + timeoutMs;
	let row: RawCusEntRow | undefined;

	for (;;) {
		const rows = await getRawCusEntRows({ internalCustomerId });
		row = rows.find((r) => r.feature_id === featureId) ?? rows[0];
		if (row && row.balance === expectedBalance) return row;
		if (Date.now() >= deadline) return row;
		await sleep(POLL_INTERVAL_MS);
	}
};

/**
 * Seeds the Semory-shaped unlimited entity slot: the entity key already
 * exists in both Postgres and the Redis subject-balance hash, with
 * `balance: null`. Lua `(balance or 0)` does not coerce cjson.null.
 */
export const seedLegacyNullEntityBalance = async ({
	ctx,
	customerId,
	customerEntitlementId,
	entityId,
	featureId,
}: {
	ctx: TestContext;
	customerId: string;
	customerEntitlementId: string;
	entityId: string;
	featureId: string;
}): Promise<void> => {
	const nullSlot = { id: entityId, balance: null, adjustment: 0 };

	await ctx.db.execute(sql`
		UPDATE customer_entitlements
		SET entities = COALESCE(entities, '{}'::jsonb) || ${JSON.stringify({ [entityId]: nullSlot })}::jsonb
		WHERE id = ${customerEntitlementId}
	`);

	const balanceKey = buildSharedFullSubjectBalanceKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId,
	});

	const deadline = Date.now() + 10_000;
	let raw: string | null = null;
	for (;;) {
		raw = await ctx.redisV2.hget(balanceKey, customerEntitlementId);
		if (raw || Date.now() >= deadline) break;
		await sleep(200);
	}
	if (!raw) {
		throw new Error(
			`subject balance missing for ${customerEntitlementId} at ${balanceKey}`,
		);
	}

	const subjectBalance = JSON.parse(raw) as {
		entities?: Record<string, { id?: string; balance?: number | null; adjustment?: number }>;
	};
	subjectBalance.entities = {
		...(subjectBalance.entities ?? {}),
		[entityId]: nullSlot,
	};

	await ctx.redisV2.hset(
		balanceKey,
		customerEntitlementId,
		JSON.stringify(subjectBalance),
	);

	const seeded = JSON.parse(
		(await ctx.redisV2.hget(balanceKey, customerEntitlementId)) ?? "{}",
	) as { entities?: Record<string, { balance?: number | null }> };
	if (seeded.entities?.[entityId]?.balance !== null) {
		throw new Error(
			`failed to seed Redis entities[${entityId}].balance=null`,
		);
	}
};
