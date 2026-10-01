import { expect, mock, test } from "bun:test";

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

test("a shard key stored before it was reserved is retired from the pool", async () => {
	const sets: unknown[] = [];
	const ctx = {
		env: { SHARD_STRIPE_SANDBOX_KEY: SHARD_KEY },
		db: {
			update: () => ({
				set: (values: unknown) => {
					sets.push(values);
					return { where: async () => [] };
				},
			}),
		},
	} as never;
	await retireShardKey({ ctx });
	expect(sets).toEqual([
		expect.objectContaining({
			usable: false,
			present: false,
			unusableReason: expect.stringContaining("stripe-connect shard"),
		}),
	]);

	sets.length = 0;
	await retireShardKey({
		ctx: { env: { SHARD_STRIPE_SANDBOX_KEY: "" }, db: {} } as never,
	});
	expect(sets).toEqual([]);
});
