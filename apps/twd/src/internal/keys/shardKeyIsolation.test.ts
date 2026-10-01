import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { hashKey, peekKeySecret, rememberKeySecret } from "./keySecrets.ts";

process.env.TWD_DATABASE_URL ??= "postgres://unused@localhost:1/unused";

const { importKeys } = await import("./actions/importKeys.ts");
const { loadKnownSecrets, retireShardKey } = await import(
	"./actions/syncKeys.ts"
);

const SHARD_KEY = "sk_test_shard";
const POOL_KEY = "sk_test_pool";

const fakeCtx = () => {
	const writes = mock(() => {
		throw new Error("the shard key must never be written to stripe_keys");
	});
	const ctx = {
		env: {
			TW_V3_KEYS: `${POOL_KEY},${SHARD_KEY}`,
			SHARD_STRIPE_SANDBOX_KEY: SHARD_KEY,
		},
		db: {
			select: () => ({ from: () => ({ where: async () => [] }) }),
			insert: writes,
			transaction: writes,
		},
		logger: { warn: () => {}, info: () => {}, error: () => {} },
	};
	return { ctx: ctx as never, writes };
};

test("the shard key is never loaded into the pool even when listed in TW_V3_KEYS", async () => {
	const { ctx } = fakeCtx();
	expect(await loadKnownSecrets({ ctx })).toEqual([POOL_KEY]);
});

test("importing the shard key is refused before it is probed or stored", async () => {
	const { ctx, writes } = fakeCtx();
	const result = await importKeys({ ctx, text: SHARD_KEY });
	expect(result).toMatchObject({ parsed: 1, added: 0, usable: 0 });
	expect(result.unusable).toEqual([
		{
			keyHint: expect.not.stringContaining(SHARD_KEY),
			reason: expect.stringContaining("stripe-connect shard"),
		},
	]);
	expect(writes).not.toHaveBeenCalled();
});

test("a shard key stored before it was reserved is retired, its secret dropped", async () => {
	const sets: Record<string, unknown>[] = [];
	const conditions: SQL[] = [];
	rememberKeySecret({ platformAccountId: "acct_shard", secret: SHARD_KEY });
	rememberKeySecret({ platformAccountId: "acct_pool", secret: POOL_KEY });
	const ctx = {
		env: { SHARD_STRIPE_SANDBOX_KEY: SHARD_KEY },
		logger: { warn: () => {} },
		db: {
			update: () => ({
				set: (values: Record<string, unknown>) => {
					sets.push(values);
					return {
						where: (condition: SQL) => {
							conditions.push(condition);
							return {
								returning: async () => [{ platformAccountId: "acct_shard" }],
							};
						},
					};
				},
			}),
		},
	} as never;
	await retireShardKey({
		ctx,
		resolvePlatformAccountId: async () => "acct_shard_platform",
	});

	expect(sets).toEqual([
		expect.objectContaining({
			usable: false,
			present: false,
			secretCiphertext: null,
			unusableReason: expect.stringContaining("stripe-connect shard"),
		}),
	]);
	const { sql, params } = new PgDialect().sqlToQuery(conditions[0]);
	// The platform match also retires a row still holding a rotated-out shard secret.
	expect(sql).toContain('"key_hash" = $1');
	expect(sql).toContain('"platform_account_id" = $2');
	expect(params).toEqual([
		hashKey({ secret: SHARD_KEY }),
		"acct_shard_platform",
	]);
	expect(peekKeySecret({ platformAccountId: "acct_shard" })).toBeUndefined();
	expect(peekKeySecret({ platformAccountId: "acct_pool" })).toBe(POOL_KEY);

	sets.length = 0;
	await retireShardKey({
		ctx: { env: { SHARD_STRIPE_SANDBOX_KEY: "" }, db: {} } as never,
	});
	expect(sets).toEqual([]);
});

test("retiring still matches the current shard key when Stripe can't name its platform", async () => {
	const conditions: SQL[] = [];
	const ctx = {
		env: { SHARD_STRIPE_SANDBOX_KEY: SHARD_KEY },
		logger: { warn: () => {} },
		db: {
			update: () => ({
				set: () => ({
					where: (condition: SQL) => {
						conditions.push(condition);
						return { returning: async () => [] };
					},
				}),
			}),
		},
	} as never;
	await retireShardKey({
		ctx,
		resolvePlatformAccountId: async () => {
			throw new Error("Stripe is down");
		},
	});
	const { sql, params } = new PgDialect().sqlToQuery(conditions[0]);
	expect(sql).toContain('"key_hash" = $1');
	expect(params).toEqual([hashKey({ secret: SHARD_KEY })]);
});
