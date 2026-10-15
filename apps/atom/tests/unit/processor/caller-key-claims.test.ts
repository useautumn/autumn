import { describe, expect, test } from "bun:test";
import { createCallerKeyClaims } from "../../../src/processor/callerKeys/createCallerKeyClaims.js";
import { DuplicateIdempotencyKeyError } from "../../../src/processor/callerKeys/duplicateIdempotencyKeyError.js";

const key = { claim: "track:k1", sent: "k1" };

/** A journal that holds no key row: only the claims in flight decide. */
const claimsWithoutRows = () =>
	createCallerKeyClaims({ journal: { holdsKey: () => false } });

const settledOf = async <T>(run: () => Promise<T>) => {
	try {
		return { ok: true as const, value: await run() };
	} catch (error) {
		return { ok: false as const, error };
	}
};

describe("a customer's caller-key claims on the owner thread", () => {
	test("two requests with one key in flight together: the first runs, the second is a duplicate even while the first awaits", async () => {
		const claims = claimsWithoutRows();
		let release = () => {};
		const first = claims.run({
			customerId: "cus_1",
			key,
			run: () =>
				new Promise<string>((resolve) => {
					release = () => resolve("deducted");
				}),
		});
		const second = settledOf(() =>
			claims.run({ customerId: "cus_1", key, run: async () => "deducted" }),
		);
		release();

		expect(await first).toBe("deducted");
		const twin = await second;
		expect(twin.ok).toBe(false);
		expect(twin.ok ? null : twin.error).toBeInstanceOf(
			DuplicateIdempotencyKeyError,
		);
		expect(twin.ok ? "" : (twin.error as Error).message).toBe(
			"Another request with idempotency key k1 has already been received",
		);
	});

	test("a request that fails releases its key, so its retry runs", async () => {
		const claims = claimsWithoutRows();
		const failed = await settledOf(() =>
			claims.run({
				customerId: "cus_1",
				key,
				run: async () => {
					throw new Error("left to the API");
				},
			}),
		);
		const retried = await claims.run({
			customerId: "cus_1",
			key,
			run: async () => "deducted",
		});

		expect(failed.ok).toBe(false);
		expect(retried).toBe("deducted");
	});

	test("a key the journal's file holds is a duplicate before the request runs", async () => {
		const claims = createCallerKeyClaims({ journal: { holdsKey: () => true } });
		let ran = false;
		const refused = await settledOf(() =>
			claims.run({
				customerId: "cus_1",
				key,
				run: async () => {
					ran = true;
				},
			}),
		);

		expect(refused.ok).toBe(false);
		expect(ran).toBe(false);
	});

	test("the same key under another customer is its own claim", async () => {
		const claims = claimsWithoutRows();
		const [a, b] = await Promise.all([
			claims.run({ customerId: "cus_1", key, run: async () => "a" }),
			claims.run({ customerId: "cus_2", key, run: async () => "b" }),
		]);
		expect([a, b]).toEqual(["a", "b"]);
	});
});
