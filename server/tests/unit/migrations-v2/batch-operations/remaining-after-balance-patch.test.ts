import { describe, expect, test } from "bun:test";
import { remainingAfterBalancePatch } from "@/internal/migrations/v2/batchOperations/actions/replaceLicenseEntitlementsForPage/remainingAfterBalancePatch.js";

describe("remainingAfterBalancePatch", () => {
	test("increment credits the live balance", () => {
		expect(
			remainingAfterBalancePatch({
				liveBalance: 60,
				patch: { balance: { type: "increment", amount: 100 } },
			}),
		).toBe(160);
	});

	test("set replaces the live balance", () => {
		expect(
			remainingAfterBalancePatch({
				liveBalance: 60,
				patch: { balance: { type: "set", amount: 200 } },
			}),
		).toBe(200);
	});

	test("no patch keeps the live balance", () => {
		expect(
			remainingAfterBalancePatch({
				liveBalance: 60,
				patch: {},
			}),
		).toBe(60);
	});

	test("increment on a null live balance stays null", () => {
		expect(
			remainingAfterBalancePatch({
				liveBalance: null,
				patch: { balance: { type: "increment", amount: 100 } },
			}),
		).toBeNull();
	});
});
